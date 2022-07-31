import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:garden_iot/serialization/relay_state.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import 'package:flutter/services.dart';

typedef RelayStateCallback = void Function(bool relayIsOpen);

class ShadowRelayModel {
  // TODO get these from build
  final _client =
      MqttServerClient('a2cy4c2yyuss64-ats.iot.eu-west-1.amazonaws.com', '');
  final _clientId = "mobile-app";
  final _deviceId = "linux-vpc-3";
  final _deviceLoggingTopic = 'linux-vpc-3/logging';

  bool _isConnected = false;
  List<VoidCallback> _onConnectedCallbacks = [];
  List<VoidCallback> _onDisconnectedCallbacks = [];
  final _relayStateListeners = new Map<int, List<RelayStateCallback>>();

  ShadowRelayModel() {}

  /// Register a closure to be called when the relay changes state.
  void addRelayStateListener(int relayId, RelayStateCallback listener) {
    var listeners = _relayStateListeners[relayId];
    if (listeners == null) {
      listeners = [listener];
      _relayStateListeners[relayId] = listeners;

      // Subscribe for updates.
      final updateTopic =
          '\$aws/things/${_deviceId}/shadow/name/RELAY${relayId}/update';
      _client.subscribe('${updateTopic}/accepted', MqttQos.atLeastOnce);
      _client.subscribe('${updateTopic}/rejected', MqttQos.atLeastOnce);

      // Get the initial state
      final getTopic =
          '\$aws/things/${_deviceId}/shadow/name/RELAY${relayId}/get';
      _client.subscribe('${getTopic}/accepted', MqttQos.atLeastOnce);
      _client.subscribe('${getTopic}/rejected', MqttQos.atLeastOnce);
      final builder = MqttClientPayloadBuilder();
      builder.addString('{}');

      // Seem to need some minimal delay between subscribing and then publishing,
      // otherwise we don't get the message.
      Future.delayed(const Duration(milliseconds: 500)).then((_) => {
            _client.publishMessage(
                getTopic, MqttQos.atLeastOnce, builder.payload!)
          });
    }
    listeners.add(listener);
  }

  /// Remove the closure registration for this relay.  Note that if the
  /// closure is registered for a different relay, it will not be removed.
  /// Returns true if the closure was registered for that relay.
  bool removeRelayStateListener(int relayId, RelayStateCallback listener) {
    var listeners = _relayStateListeners[relayId];
    if (listeners == null) {
      return false;
    }
    bool wasRegistered = listeners.remove(listener);
    listeners = _relayStateListeners[relayId];
    if (listeners == null || listeners.length == 0) {
      final topic = '\$aws/things/${_clientId}/shadow/name/RELAY${relayId}/get';
      _client.unsubscribe('${topic}/accepted');
      _client.unsubscribe('${topic}/rejected');
    }
    return wasRegistered;
  }

  void addOnConnectedCallback(VoidCallback onConnectedCallback) =>
      _onConnectedCallbacks.add(onConnectedCallback);
  bool removeOnConnectedCallback(VoidCallback onConnectedCallback) =>
      _onConnectedCallbacks.remove(onConnectedCallback);

  void addOnDisconnectedCallback(VoidCallback onDisconnectedCallback) =>
      _onDisconnectedCallbacks.add(onDisconnectedCallback);
  bool removeOnDisconnectedCallback(VoidCallback onDisconnectedCallback) =>
      _onDisconnectedCallbacks.remove(onDisconnectedCallback);

  bool get isConnected => _isConnected;

  Future<bool> mqttDisconnect() async {
    _client.disconnect();
    _isConnected = false;
    return true;
  }

  Future<bool> mqttConnect(AssetBundle bundle) async {
    try {
      if (_isConnected) {
        return true;
      }
      ByteData rootCA = await bundle.load('assets/certs/AmazonRootCA1.pem');
      ByteData deviceCert = await bundle.load(
          'assets/certs/bb381ae692c9965e9996ab013d428e49a05d1ac15eacc08ae555e3eb414014aa-certificate.pem.crt');
      ByteData privateKey = await bundle.load(
          'assets/certs/bb381ae692c9965e9996ab013d428e49a05d1ac15eacc08ae555e3eb414014aa-private.pem.key');

      SecurityContext context = SecurityContext.defaultContext;
      context.setClientAuthoritiesBytes(rootCA.buffer.asUint8List());
      context.useCertificateChainBytes(deviceCert.buffer.asUint8List());
      context.usePrivateKeyBytes(privateKey.buffer.asUint8List());
      context.setAlpnProtocols(["x-amzn-mqtt-ca"], false);

      _client.securityContext = context;
      _client.logging(on: false);
      _client.keepAlivePeriod = 20;
      _client.port = 443;
      _client.secure = true;
      _client.onConnected = _onConnected;
      _client.onDisconnected = _onDisconnected;
      _client.onSubscribed = onSubscribed;
      _client.onSubscribeFail = onSubscribeFail;
      _client.onUnsubscribed = onUnsubscribed;
      _client.pongCallback = pong;

      final MqttConnectMessage connMess =
          MqttConnectMessage().withClientIdentifier(_clientId).startClean();
      _client.connectionMessage = connMess;

      final connStatus = await _client.connect();
      if (_client.connectionStatus!.state == MqttConnectionState.connected) {
        print('Connected : ${connStatus}');
      } else {
        print('Failed to connect:\n${_client.connectionStatus}\n${connStatus}');
        return false;
      }

      _client.subscribe(_deviceLoggingTopic, MqttQos.atLeastOnce);
      _client.updates?.listen(onData, onError: onError, onDone: onDone);

      return true;
    } catch (exception, stacktrace) {
      print('Failed to connect: ${exception}, ${stacktrace}');
      return false;
    }
  }

  void pong() {
    print('Ping response callback invoked');
  }

  void onSubscribed(String topic) {
    print('Subscribed to ${topic}');
  }

  void onSubscribeFail(String topic) {
    print('Subscribe to ${topic} failed');
  }

  void onUnsubscribed(String? topic) {
    print('Unsubscribed from ${topic}');
  }

  void _onConnected() {
    _isConnected = true;
    for (final cb in _onConnectedCallbacks) {
      cb.call();
    }
  }

  void _onDisconnected() {
    _isConnected = false;
    for (final cb in _onDisconnectedCallbacks) {
      cb.call();
    }
  }

  void onData(List<MqttReceivedMessage<MqttMessage>> mqttReceivedMessages) {
    final topic = mqttReceivedMessages[0].topic;
    final mqttPublishMessage =
        mqttReceivedMessages[0].payload as MqttPublishMessage;
    if (topic == _deviceLoggingTopic) {
      _onLogging(mqttPublishMessage);
      return;
    }
    // TODO process gets, updates etc etc differently because each topic
    // should have different format messages.
    final getTopicRE = RegExp(r"/get/accepted");
    var matches = getTopicRE.firstMatch(topic);
    if (matches != null) {
      _onGetStateMessage(mqttPublishMessage);
      return;
    }

    final updateAcceptedTopicRE = RegExp(r".*/(RELAY[0-9]+)/update/accepted");
    matches = updateAcceptedTopicRE.firstMatch(topic);
    if (matches != null) {
      final relayId = topic.replaceFirstMapped(
          RegExp(r".*/(RELAY([0-9]+))/update/accepted"),
          (match) => '${match[2]}');
      _onUpdateStateMessage(int.parse(relayId), mqttPublishMessage);
      return;
    }

    String json = utf8.decode(mqttPublishMessage.payload.message);
    print('json = ${json}');
    try {
      ReportedState state = ReportedState.fromJson(jsonDecode(json));
      print('reported open_closed = ${state.reported.openClosed.open_closed}');
    } catch (e) {
      print('Not a ReportedState: ${e}');
    }
    try {
      DesiredState state = DesiredState.fromJson(jsonDecode(json));
      print('desired open_closed = ${state.desired.openClosed.open_closed}');
    } catch (e) {
      print('Not a DesiredState: ${e}');
    }
  }

  void onError(Object error) {
    print('onError: ${error}');
  }

  void onDone() {
    print('onDone');
  }

  void _onLogging(MqttPublishMessage mqttPublishMessage) {
    String json = utf8.decode(mqttPublishMessage.payload.message);
    // print('Logging Message: ${json}');
  }

  void _onUpdateStateMessage(
      int relayId, MqttPublishMessage mqttPublishMessage) {
    try {
      String json = utf8.decode(mqttPublishMessage.payload.message);
      ReportedState state = ReportedState.fromJson(jsonDecode(json));
      print(
          'State reported for relay ${relayId} ${state.reported.openClosed.open_closed}');
      final openClosed = state.reported.openClosed.open_closed == "open";
      _relayStateListeners[relayId]?.forEach((relayStateListener) {
        relayStateListener(openClosed);
      });
    } catch (e) {
      print('Not a ReportedState: ${e}');
    }
  }

  void _onGetStateMessage(MqttPublishMessage mqttPublishMessage) {
    String json = utf8.decode(mqttPublishMessage.payload.message);
    print('Get State Message: ${json}');
  }
}

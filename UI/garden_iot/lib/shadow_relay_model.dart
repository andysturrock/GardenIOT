import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/serialization/desired_state.dart';
import 'package:garden_iot/serialization/reported_state.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import 'package:flutter/services.dart';

typedef RelayStateCallback = void Function(bool relayIsOpen);

class ShadowRelayModel {
  final _client = MqttServerClient(Env.iotEndPoint(), '');
  final _clientId = Env.clientId();
  final _deviceId = Env.deviceId();
  final _deviceLoggingTopic = Env.deviceLoggingTopic();
  final LogModel _logModel;

  bool _isConnected = false;
  List<VoidCallback> _onConnectedCallbacks = [];
  List<VoidCallback> _onDisconnectedCallbacks = [];
  final _relayStateListeners = new Map<int, List<RelayStateCallback>>();

  ShadowRelayModel(this._logModel);

  /// Register a closure to be called when the relay changes state.
  void addRelayStateListener(int relayId, RelayStateCallback listener) {
    var listeners = _relayStateListeners[relayId];
    if (listeners == null || listeners.length == 0) {
      listeners = [listener];
      _relayStateListeners[relayId] = listeners;

      // Subscribe for updates.
      final updateTopic =
          '\$aws/things/$_deviceId/shadow/name/RELAY$relayId/update';
      _client.subscribe('$updateTopic/accepted', MqttQos.atLeastOnce);
      _client.subscribe('$updateTopic/rejected', MqttQos.atLeastOnce);

      // Get the initial state
      final getTopic = '\$aws/things/$_deviceId/shadow/name/RELAY$relayId/get';
      _client.subscribe('$getTopic/accepted', MqttQos.atLeastOnce);
      _client.subscribe('$getTopic/rejected', MqttQos.atLeastOnce);
      final builder = MqttClientPayloadBuilder();
      builder.addString('{}');

      // Seem to need some minimal delay between subscribing and then publishing,
      // otherwise we don't get the message.
      Future.delayed(const Duration(milliseconds: 500)).then((_) => {
            _client.publishMessage(
                getTopic, MqttQos.atLeastOnce, builder.payload!)
          });
    } else {
      listeners.add(listener);
    }
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
      final getTopic = '\$aws/things/$_clientId/shadow/name/RELAY$relayId/get';
      _client.unsubscribe('$getTopic/accepted');
      _client.unsubscribe('$getTopic/rejected');
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

  void updateState(int relayId, bool openClosed) {
    final updateTopic =
        '\$aws/things/$_deviceId/shadow/name/RELAY$relayId/update';

    final builder = MqttClientPayloadBuilder();

    final desiredStateMessage = {
      "state": {
        "desired": {"open_closed": openClosed ? "open" : "closed"}
      }
    };
    String message = json.encode(desiredStateMessage);
    builder.addString(message);

    _client.publishMessage(updateTopic, MqttQos.atLeastOnce, builder.payload!);
  }

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
      ByteData rootCA = await bundle.load(Env.rootCAPath());
      ByteData deviceCert = await bundle.load(Env.deviceCertPath());
      ByteData privateKey = await bundle.load(Env.privateKeyPath());

      SecurityContext context = SecurityContext.defaultContext;
      context.setClientAuthoritiesBytes(rootCA.buffer.asUint8List());
      context.useCertificateChainBytes(deviceCert.buffer.asUint8List());
      context.usePrivateKeyBytes(privateKey.buffer.asUint8List());
      context.setAlpnProtocols(["x-amzn-mqtt-ca"], false);

      _client.securityContext = context;
      _client.logging(on: Env.mqttLogging());
      _client.keepAlivePeriod = 20;
      _client.port = 443;
      _client.secure = true;
      _client.onConnected = _onConnected;
      _client.onDisconnected = _onDisconnected;
      _client.onSubscribed = _onSubscribed;
      _client.onSubscribeFail = _onSubscribeFail;
      _client.onUnsubscribed = _onUnsubscribed;
      _client.pongCallback = _pong;

      final MqttConnectMessage connMess =
          MqttConnectMessage().withClientIdentifier(_clientId).startClean();
      _client.connectionMessage = connMess;

      final connStatus = await _client.connect();
      if (_client.connectionStatus!.state == MqttConnectionState.connected) {
        _logModel.log('Connected : $connStatus');
      } else {
        _logModel.log(
            'Failed to connect:\n${_client.connectionStatus}\n$connStatus');
        return false;
      }

      _client.subscribe(_deviceLoggingTopic, MqttQos.atLeastOnce);
      _client.updates?.listen(onData, onError: onError, onDone: onDone);

      return true;
    } catch (exception, stacktrace) {
      _logModel.log('Failed to connect: $exception, $stacktrace');
      return false;
    }
  }

  void _pong() {
    _logModel.log('Ping response callback invoked');
  }

  void _onSubscribed(String topic) {
    _logModel.log('Subscribed to $topic');
  }

  void _onSubscribeFail(String topic) {
    _logModel.log('Subscribe to $topic failed');
  }

  void _onUnsubscribed(String? topic) {
    _logModel.log('Unsubscribed from $topic');
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
    final updateAcceptedTopicRE = RegExp(r".*/(RELAY[0-9]+)/update/accepted");
    var matches = updateAcceptedTopicRE.firstMatch(topic);
    if (matches != null) {
      final relayId = topic.replaceFirstMapped(
          RegExp(r".*/(RELAY([0-9]+))/update/accepted"),
          (match) => '${match[2]}');
      _onUpdateStateMessage(int.parse(relayId), mqttPublishMessage);
      return;
    }

    final getAcceptedTopicRE = RegExp(r".*/(RELAY[0-9]+)/get/accepted");
    matches = getAcceptedTopicRE.firstMatch(topic);
    if (matches != null) {
      final relayId = topic.replaceFirstMapped(
          RegExp(r".*/(RELAY([0-9]+))/get/accepted"), (match) => '${match[2]}');
      _onGetStateMessage(int.parse(relayId), mqttPublishMessage);
      return;
    }

    String json = utf8.decode(mqttPublishMessage.payload.message);
    _logModel.log('Unexpected message: $json');
  }

  void onError(Object error) {
    _logModel.log('onError: $error');
  }

  void onDone() {
    _logModel.log('onDone');
  }

  void _onLogging(MqttPublishMessage mqttPublishMessage) {
    // String json = utf8.decode(mqttPublishMessage.payload.message);
    // print('Logging Message: ${json}');
  }

  void _onUpdateStateMessage(
      int relayId, MqttPublishMessage mqttPublishMessage) {
    try {
      final json = jsonDecode(utf8.decode(mqttPublishMessage.payload.message));
      var openClosed = false;
      if (json["state"]?["reported"] != null) {
        ReportedState state = ReportedState.fromJson(json);
        openClosed = state.reported.openClosed.openClosed == "open";
        _logModel.log('State reported for relay $relayId $openClosed');
        _relayStateListeners[relayId]?.forEach((relayStateListener) {
          relayStateListener(openClosed);
        });
      }
      if (json["state"]?["desired"] != null) {
        // This is either our own desired message or from another device.
        // Either way we can just log it for debugging purposes and ignore it.
        DesiredState state = DesiredState.fromJson(json);
        openClosed = state.desired.openClosed.openClosed == "open";
        _logModel.log('State desired for relay $relayId $openClosed');
      }
    } catch (error) {
      _logModel.log('Failed to decode updated state message: $error');
    }
  }

  void _onGetStateMessage(int relayId, MqttPublishMessage mqttPublishMessage) {
    try {
      String json = utf8.decode(mqttPublishMessage.payload.message);
      print('Get state: $json');
      ReportedState state = ReportedState.fromJson(jsonDecode(json));
      print(
          'State reported for relay $relayId ${state.reported.openClosed.openClosed}');
      final openClosed = state.reported.openClosed.openClosed == "open";
      _relayStateListeners[relayId]?.forEach((relayStateListener) {
        relayStateListener(openClosed);
      });
    } catch (error) {
      print('Not a ReportedState: $error');
    }
  }
}

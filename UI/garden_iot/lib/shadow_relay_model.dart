import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:garden_iot/serialization/relay_state.dart';
import 'package:mqtt_client/mqtt_client.dart';
import 'package:mqtt_client/mqtt_server_client.dart';
import 'package:flutter/services.dart';

class ShadowRelay {
  final int relay_id;
  final bool open;

  ShadowRelay(this.relay_id, this.open);

  @override
  String toString() {
    return '"relay_id": ${relay_id}, "open": ${open}';
  }
}

typedef RelayStateCallback = void Function(bool relayIsOpen);

class ShadowRelayModel {
  // TODO get this from build
  final _client =
      MqttServerClient('a2cy4c2yyuss64-ats.iot.eu-west-1.amazonaws.com', '');
  // TODO get this from build
  final _clientId = "linux-vpc-3";

  bool _isConnected = false;
  List<VoidCallback> _onConnectedCallbacks = [];
  List<VoidCallback> _onDisconnectedCallbacks = [];
  final _relayStateListeners = new Map<int, List<RelayStateCallback>>();

  ShadowRelayModel() {
    _initState();
  }

  /// Register a closure to be called when the relay changes state.
  void addRelayStateListener(int relayId, RelayStateCallback listener) {
    var listeners = _relayStateListeners[relayId];
    if (listeners == null) {
      listeners = [];
      _relayStateListeners[relayId] = listeners;
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
    return listeners.remove(listener);
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

  void _initState() async {
    await _mqttConnect();
  }

  Future<void> _mqttConnect() async {
    ByteData rootCA = await rootBundle.load('assets/certs/AmazonRootCA1.pem');
    ByteData deviceCert =
        await rootBundle.load('assets/certs/cert-certificate.pem.crt');
    ByteData privateKey =
        await rootBundle.load('assets/certs/cert-private.pem.key');

    SecurityContext context = SecurityContext.defaultContext;
    context.setClientAuthoritiesBytes(rootCA.buffer.asUint8List());
    context.useCertificateChainBytes(deviceCert.buffer.asUint8List());
    context.usePrivateKeyBytes(privateKey.buffer.asUint8List());
    context.setAlpnProtocols(["x-amzn-mqtt-ca"], false);

    _client.securityContext = context;
    _client.logging(on: true);
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

    try {
      await _client.connect();
      if (_client.connectionStatus!.state == MqttConnectionState.connected) {
        print("Connected");
      } else {
        print("Failed to connect: ${_client.connectionStatus}");
      }

      const topic = 'linux-vpc-3/logging';
      _client.subscribe(topic, MqttQos.atLeastOnce);

      _client.updates?.listen(onData, onError: onError, onDone: onDone);
    } catch (exception, stacktrace) {
      print('Failed to connect: ${exception}, ${stacktrace}');
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
    final recMess = mqttReceivedMessages[0].payload as MqttPublishMessage;
    String json = utf8.decode(recMess.payload.message);
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

  void onError(Object error) {}

  void onDone() {}
}

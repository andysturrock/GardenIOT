import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:mqtt_client/mqtt_client.dart' as mqtt;
import 'package:mqtt_client/mqtt_server_client.dart';

enum MqttConnectivity { disconnected, connecting, connected }

class ShadowRelayModel with ChangeNotifier {
  static final RegExp _topicPattern =
      RegExp(r'.*/RELAY([0-9]+)/(update|get)/accepted');

  final LogModel _logModel;
  final MqttServerClient _client =
      MqttServerClient(AppConfig.iotEndPoint, AppConfig.clientId);

  final Map<int, RelayState> _reportedStates = <int, RelayState>{};

  MqttConnectivity _connectionState = MqttConnectivity.disconnected;
  bool _initialised = false;

  ShadowRelayModel(this._logModel);

  MqttConnectivity get connectionState => _connectionState;
  bool get isConnected => _connectionState == MqttConnectivity.connected;

  RelayState? reportedStateFor(int relayId) => _reportedStates[relayId];

  Future<bool> mqttConnect(AssetBundle bundle) async {
    if (_connectionState != MqttConnectivity.disconnected) {
      return isConnected;
    }
    _setConnectionState(MqttConnectivity.connecting);

    try {
      if (!_initialised) {
        await _configureClient(bundle);
        _initialised = true;
      }

      final connMess = mqtt.MqttConnectMessage()
          .withClientIdentifier(AppConfig.clientId)
          .startClean();
      _client.connectionMessage = connMess;

      await _client.connect();

      if (_client.connectionStatus?.state != mqtt.MqttConnectionState.connected) {
        _logModel.log('MQTT connect failed: ${_client.connectionStatus}');
        _setConnectionState(MqttConnectivity.disconnected);
        return false;
      }

      _logModel.log('MQTT connected');
      _client.updates?.listen(_onData, onError: _onStreamError, onDone: _onStreamDone);
      _subscribeAllRelays();
      _setConnectionState(MqttConnectivity.connected);
      return true;
    } catch (e, st) {
      _logModel.log('MQTT connect threw: $e\n$st');
      _setConnectionState(MqttConnectivity.disconnected);
      return false;
    }
  }

  Future<void> mqttDisconnect() async {
    if (_connectionState == MqttConnectivity.disconnected) return;
    _client.disconnect();
    _setConnectionState(MqttConnectivity.disconnected);
  }

  void setDesiredState(int relayId, RelayState desired) {
    if (!isConnected) {
      _logModel.log('Cannot set relay $relayId: not connected');
      return;
    }
    final topic = _shadowTopic(relayId, 'update');
    final payload = jsonEncode(ShadowMessage.desiredUpdate(desired));
    final builder = mqtt.MqttClientPayloadBuilder()..addString(payload);
    _client.publishMessage(topic, mqtt.MqttQos.atLeastOnce, builder.payload!);
  }

  Future<void> _configureClient(AssetBundle bundle) async {
    final rootCA = await bundle.load(AppConfig.rootCAPath);
    final deviceCert = await bundle.load(AppConfig.deviceCertPath);
    final privateKey = await bundle.load(AppConfig.privateKeyPath);

    final securityContext = SecurityContext(withTrustedRoots: false)
      ..setTrustedCertificatesBytes(rootCA.buffer.asUint8List())
      ..useCertificateChainBytes(deviceCert.buffer.asUint8List())
      ..usePrivateKeyBytes(privateKey.buffer.asUint8List())
      ..setAlpnProtocols(['x-amzn-mqtt-ca'], false);

    _client
      ..securityContext = securityContext
      ..logging(on: AppConfig.mqttLogging)
      ..keepAlivePeriod = 20
      ..port = 443
      ..secure = true
      ..onConnected = _onConnected
      ..onDisconnected = _onDisconnected
      ..onSubscribed = _onSubscribed
      ..onSubscribeFail = _onSubscribeFail
      ..onUnsubscribed = _onUnsubscribed
      ..pongCallback = () => _logModel.log('MQTT pong');
  }

  void _subscribeAllRelays() {
    for (final relay in AppConfig.relays) {
      _subscribeRelay(relay.relayId);
    }
  }

  void _subscribeRelay(int relayId) {
    final updateTopic = _shadowTopic(relayId, 'update');
    final getTopic = _shadowTopic(relayId, 'get');
    _client.subscribe('$updateTopic/accepted', mqtt.MqttQos.atLeastOnce);
    _client.subscribe('$updateTopic/rejected', mqtt.MqttQos.atLeastOnce);
    _client.subscribe('$getTopic/accepted', mqtt.MqttQos.atLeastOnce);
    _client.subscribe('$getTopic/rejected', mqtt.MqttQos.atLeastOnce);

    final builder = mqtt.MqttClientPayloadBuilder()..addString('{}');
    // Request the initial state. The 500ms delay matches the AWS IoT
    // subscribe→publish ordering recommendation; without it the broker can
    // discard the accepted/get response before our subscription is active.
    Future<void>.delayed(const Duration(milliseconds: 500)).then((_) {
      if (_connectionState == MqttConnectivity.disconnected) return;
      _client.publishMessage(getTopic, mqtt.MqttQos.atLeastOnce, builder.payload!);
    });
  }

  String _shadowTopic(int relayId, String action) =>
      '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY$relayId/$action';

  void _setConnectionState(MqttConnectivity state) {
    if (_connectionState == state) return;
    _connectionState = state;
    notifyListeners();
  }

  void _onConnected() {
    _logModel.log('MQTT onConnected');
    _setConnectionState(MqttConnectivity.connected);
  }

  void _onDisconnected() {
    _logModel.log('MQTT onDisconnected');
    _setConnectionState(MqttConnectivity.disconnected);
  }

  void _onSubscribed(String topic) => _logModel.log('Subscribed: $topic');
  void _onSubscribeFail(String topic) => _logModel.log('Subscribe failed: $topic');
  void _onUnsubscribed(String? topic) => _logModel.log('Unsubscribed: $topic');

  void _onData(List<mqtt.MqttReceivedMessage<mqtt.MqttMessage>> events) {
    for (final event in events) {
      final topic = event.topic;
      final match = _topicPattern.firstMatch(topic);
      if (match == null) continue;
      final relayId = int.parse(match.group(1)!);
      final publish = event.payload as mqtt.MqttPublishMessage;
      final body = utf8.decode(publish.payload.message);
      try {
        final msg = ShadowMessage.fromJson(jsonDecode(body) as Map<String, dynamic>);
        if (msg.reported != null) {
          _reportedStates[relayId] = msg.reported!;
          _logModel.log('Relay $relayId reported ${msg.reported!.toJsonString()}');
          notifyListeners();
        }
        if (msg.desired != null) {
          _logModel.log('Relay $relayId desired ${msg.desired!.toJsonString()}');
        }
      } catch (e) {
        _logModel.log('Failed to decode shadow message for $topic: $e');
      }
    }
  }

  void _onStreamError(Object error) => _logModel.log('MQTT stream error: $error');
  void _onStreamDone() => _logModel.log('MQTT stream done');

  @override
  void dispose() {
    _client.disconnect();
    super.dispose();
  }
}

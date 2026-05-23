import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:mqtt_client/mqtt_client.dart' as mqtt;
import 'package:mqtt_client/mqtt_server_client.dart';

enum MqttConnectivity { disconnected, connecting, connected }

/// A topic + payload pair carved out of the mqtt_client stream so callers
/// don't have to know about MqttReceivedMessage / MqttPublishMessage /
/// the utf8 decode dance.
class MqttDelivery {
  final String topic;
  final String payload;
  const MqttDelivery(this.topic, this.payload);
}

/// Surface that shadow models and the Retry button depend on. The real
/// [MqttGateway] is the production implementation; tests substitute a
/// fake that drives the [messages] stream directly without involving
/// mqtt_client at all.
abstract class MqttGatewayLike implements Listenable {
  bool get isConnected;
  MqttConnectivity get connectionState;
  Stream<MqttDelivery> get messages;
  void subscribe(String topic);
  void publishJson(String topic, Object payload);
  Future<bool> mqttConnect(AssetBundle bundle);
  Future<void> mqttDisconnect();
}

/// Owns the single MqttServerClient that the app uses to talk to AWS IoT.
/// Shadow models subscribe via [messages] (filtered with `.where`) and
/// publish via [publishJson].
class MqttGateway with ChangeNotifier implements MqttGatewayLike {
  final LogModel _logModel;
  final mqtt.MqttClient _client;

  final StreamController<MqttDelivery> _deliveryController =
      StreamController<MqttDelivery>.broadcast();
  StreamSubscription<List<mqtt.MqttReceivedMessage<mqtt.MqttMessage>>>?
      _updatesSubscription;

  MqttConnectivity _connectionState = MqttConnectivity.disconnected;
  bool _initialised = false;
  bool _disposed = false;

  MqttGateway(this._logModel)
      : _client = MqttServerClient(AppConfig.iotEndPoint, AppConfig.clientId);

  @override
  MqttConnectivity get connectionState => _connectionState;
  @override
  bool get isConnected => _connectionState == MqttConnectivity.connected;
  @override
  Stream<MqttDelivery> get messages => _deliveryController.stream;
  mqtt.MqttClient get client => _client;

  @override
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
      _updatesSubscription = _client.updates?.listen(
        _onData,
        onError: _onStreamError,
        onDone: _onStreamDone,
      );
      _setConnectionState(MqttConnectivity.connected);
      return true;
    } catch (e, st) {
      _logModel.log('MQTT connect threw: $e\n$st');
      _setConnectionState(MqttConnectivity.disconnected);
      return false;
    }
  }

  @override
  Future<void> mqttDisconnect() async {
    if (_connectionState == MqttConnectivity.disconnected) return;
    _client.disconnect();
    await _updatesSubscription?.cancel();
    _updatesSubscription = null;
    _setConnectionState(MqttConnectivity.disconnected);
  }

  @override
  void subscribe(String topic) {
    _client.subscribe(topic, mqtt.MqttQos.atLeastOnce);
  }

  @override
  void publishJson(String topic, Object payload) {
    final builder = mqtt.MqttClientPayloadBuilder()..addString(jsonEncode(payload));
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

    final c = _client as MqttServerClient;
    c
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
      final publish = event.payload as mqtt.MqttPublishMessage;
      final body = utf8.decode(publish.payload.message);
      _deliveryController.add(MqttDelivery(event.topic, body));
    }
  }

  void _onStreamError(Object error) => _logModel.log('MQTT stream error: $error');
  void _onStreamDone() => _logModel.log('MQTT stream done');

  @override
  void dispose() {
    if (_disposed) return;
    _disposed = true;
    _client.disconnect();
    _updatesSubscription?.cancel();
    _deliveryController.close();
    super.dispose();
  }
}

import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:garden_iot/mqtt_gateway.dart';

/// In-memory MqttGateway impl for unit tests. Records every subscribe
/// and publish, and lets the test drive deliveries / connection state.
class FakeMqttGateway with ChangeNotifier implements MqttGatewayLike {
  final StreamController<MqttDelivery> _controller =
      StreamController<MqttDelivery>.broadcast();

  final List<String> subscriptions = [];
  final List<({String topic, Object payload})> publishes = [];
  int mqttConnectCalls = 0;
  int mqttDisconnectCalls = 0;

  MqttConnectivity _state = MqttConnectivity.disconnected;

  @override
  MqttConnectivity get connectionState => _state;
  @override
  bool get isConnected => _state == MqttConnectivity.connected;
  @override
  Stream<MqttDelivery> get messages => _controller.stream;

  @override
  void subscribe(String topic) {
    subscriptions.add(topic);
  }

  @override
  void publishJson(String topic, Object payload) {
    publishes.add((topic: topic, payload: payload));
  }

  @override
  Future<bool> mqttConnect(AssetBundle bundle) async {
    mqttConnectCalls += 1;
    setConnectionState(MqttConnectivity.connected);
    return true;
  }

  @override
  Future<void> mqttDisconnect() async {
    mqttDisconnectCalls += 1;
    setConnectionState(MqttConnectivity.disconnected);
  }

  /// Push the gateway to a new state and notify listeners.
  void setConnectionState(MqttConnectivity next) {
    if (_state == next) return;
    _state = next;
    notifyListeners();
  }

  /// Simulate a delivery from the broker.
  void deliver(String topic, String payload) {
    _controller.add(MqttDelivery(topic, payload));
  }

  /// Convenience helpers tests reach for repeatedly.
  void reset() {
    subscriptions.clear();
    publishes.clear();
  }

  @override
  void dispose() {
    _controller.close();
    super.dispose();
  }
}

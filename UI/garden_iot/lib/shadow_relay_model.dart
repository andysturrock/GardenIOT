import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/utils/env.dart';

class ShadowRelayModel with ChangeNotifier {
  static final RegExp _topicPattern =
      RegExp(r'.*/RELAY([0-9]+)/(update|get)/accepted');

  final LogModel _logModel;
  final MqttGatewayLike _gateway;
  final Map<int, RelayState> _reportedStates = <int, RelayState>{};

  StreamSubscription<MqttDelivery>? _deliverySub;
  final List<Timer> _pendingGetTimers = <Timer>[];
  bool _subscribed = false;
  bool _disposed = false;

  ShadowRelayModel(this._logModel, this._gateway) {
    _gateway.addListener(_onGatewayChange);
    _onGatewayChange();
  }

  bool get isConnected => _gateway.isConnected;
  MqttConnectivity get connectionState => _gateway.connectionState;

  RelayState? reportedStateFor(int relayId) => _reportedStates[relayId];

  void setDesiredState(int relayId, RelayState desired) {
    if (!isConnected) {
      _logModel.log('Cannot set relay $relayId: not connected');
      return;
    }
    final topic = _shadowTopic(relayId, 'update');
    _gateway.publishJson(topic, ShadowMessage.desiredUpdate(desired));
  }

  void _onGatewayChange() {
    if (_gateway.isConnected && !_subscribed) {
      _subscribed = true;
      _deliverySub ??= _gateway.messages.listen(_onDelivery);
      _subscribeAllRelays();
    }
    if (!_gateway.isConnected && _subscribed) {
      _subscribed = false;
      _reportedStates.clear();
    }
    notifyListeners();
  }

  void _subscribeAllRelays() {
    for (final relay in AppConfig.relays) {
      _subscribeRelay(relay.relayId);
    }
  }

  void _subscribeRelay(int relayId) {
    final updateTopic = _shadowTopic(relayId, 'update');
    final getTopic = _shadowTopic(relayId, 'get');
    _gateway.subscribe('$updateTopic/accepted');
    _gateway.subscribe('$updateTopic/rejected');
    _gateway.subscribe('$getTopic/accepted');
    _gateway.subscribe('$getTopic/rejected');

    // The 500ms delay matches the AWS IoT subscribe→publish ordering
    // recommendation; without it the broker can discard the accepted/get
    // response before our subscription is active. Tracked so dispose can
    // cancel pending timers and avoid leaked work in tests.
    late Timer timer;
    timer = Timer(const Duration(milliseconds: 500), () {
      _pendingGetTimers.remove(timer);
      if (_disposed || !_gateway.isConnected) return;
      _gateway.publishJson(getTopic, const <String, dynamic>{});
    });
    _pendingGetTimers.add(timer);
  }

  String _shadowTopic(int relayId, String action) =>
      '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY$relayId/$action';

  void _onDelivery(MqttDelivery msg) {
    final match = _topicPattern.firstMatch(msg.topic);
    if (match == null) return;
    final relayId = int.parse(match.group(1)!);
    try {
      final shadow = ShadowMessage.fromJson(
          jsonDecode(msg.payload) as Map<String, dynamic>);
      if (shadow.reported != null) {
        _reportedStates[relayId] = shadow.reported!;
        _logModel
            .log('Relay $relayId reported ${shadow.reported!.toJsonString()}');
        notifyListeners();
      }
      if (shadow.desired != null) {
        _logModel.log('Relay $relayId desired ${shadow.desired!.toJsonString()}');
      }
    } catch (e) {
      _logModel.log('Failed to decode shadow message for ${msg.topic}: $e');
    }
  }

  @override
  void dispose() {
    _disposed = true;
    for (final t in _pendingGetTimers) {
      t.cancel();
    }
    _pendingGetTimers.clear();
    _gateway.removeListener(_onGatewayChange);
    _deliverySub?.cancel();
    super.dispose();
  }
}

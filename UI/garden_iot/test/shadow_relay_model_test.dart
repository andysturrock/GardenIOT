import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/utils/env.dart';

import 'fakes/fake_mqtt_gateway.dart';

void main() {
  late LogModel logModel;
  late FakeMqttGateway gateway;

  setUp(() {
    logModel = LogModel();
    gateway = FakeMqttGateway();
  });

  tearDown(() {
    gateway.dispose();
    logModel.dispose();
  });

  /// Drives the gateway through disconnected → connected → flushes the
  /// async _publishGet timer, then returns the model.
  Future<ShadowRelayModel> connectModel() async {
    final model = ShadowRelayModel(logModel, gateway);
    gateway.setConnectionState(MqttConnectivity.connected);
    // The model schedules its /get publishes via Future.delayed(500ms);
    // pump real time so they fire before assertions.
    await Future<void>.delayed(const Duration(milliseconds: 600));
    return model;
  }

  group('ShadowRelayModel (no MQTT)', () {
    test('starts disconnected and delegates state via getters', () {
      final model = ShadowRelayModel(logModel, gateway);
      expect(model.connectionState, MqttConnectivity.disconnected);
      expect(model.isConnected, isFalse);
    });

    test('reportedStateFor returns null for unknown relays', () {
      final model = ShadowRelayModel(logModel, gateway);
      expect(model.reportedStateFor(1), isNull);
      expect(model.reportedStateFor(999), isNull);
    });

    test('setDesiredState logs + no-ops when not connected', () {
      final model = ShadowRelayModel(logModel, gateway);
      model.setDesiredState(1, RelayState.open);
      expect(
        logModel.messages.any((m) => m.contains('not connected')),
        isTrue,
        reason: 'expected log line about not being connected',
      );
      expect(gateway.publishes, isEmpty);
    });

    test('exposes the MqttConnectivity enum values app code branches on', () {
      expect(MqttConnectivity.values, hasLength(3));
      expect(MqttConnectivity.values, contains(MqttConnectivity.disconnected));
      expect(MqttConnectivity.values, contains(MqttConnectivity.connecting));
      expect(MqttConnectivity.values, contains(MqttConnectivity.connected));
    });
  });

  group('ShadowRelayModel (connected)', () {
    test('subscribes to all four topics per relay on connect', () async {
      await connectModel();
      // Four relays × four topics
      expect(gateway.subscriptions, hasLength(AppConfig.relays.length * 4));
      for (final relay in AppConfig.relays) {
        final base = '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY${relay.relayId}';
        expect(gateway.subscriptions, contains('$base/update/accepted'));
        expect(gateway.subscriptions, contains('$base/update/rejected'));
        expect(gateway.subscriptions, contains('$base/get/accepted'));
        expect(gateway.subscriptions, contains('$base/get/rejected'));
      }
    });

    test('publishes a /get for each relay after the 500ms guard', () async {
      await connectModel();
      // Exactly one /get per relay
      final gets = gateway.publishes
          .where((p) => p.topic.endsWith('/get'))
          .toList();
      expect(gets, hasLength(AppConfig.relays.length));
    });

    test('skips the delayed /get if the gateway dropped while we waited', () async {
      ShadowRelayModel(logModel, gateway);
      gateway.setConnectionState(MqttConnectivity.connected);
      // Drop immediately
      gateway.setConnectionState(MqttConnectivity.disconnected);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(gateway.publishes, isEmpty);
    });

    test('reset on disconnect clears the reportedStates cache', () async {
      final model = await connectModel();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY1/update/accepted',
        jsonEncode({
          'state': {
            'reported': {'open_closed': 'open'}
          }
        }),
      );
      await Future<void>.delayed(Duration.zero);
      expect(model.reportedStateFor(1), RelayState.open);
      gateway.setConnectionState(MqttConnectivity.disconnected);
      expect(model.reportedStateFor(1), isNull);
    });

    test('setDesiredState publishes a desired update for the given relay', () async {
      final model = await connectModel();
      gateway.reset();
      model.setDesiredState(2, RelayState.open);
      expect(gateway.publishes, hasLength(1));
      expect(gateway.publishes.first.topic,
          '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY2/update');
      expect(gateway.publishes.first.payload,
          {'state': {'desired': {'open_closed': 'open'}}});
    });

    test('applies reported state from /update/accepted', () async {
      final model = await connectModel();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY3/update/accepted',
        jsonEncode({
          'state': {
            'reported': {'open_closed': 'closed'}
          }
        }),
      );
      await Future<void>.delayed(Duration.zero);
      expect(model.reportedStateFor(3), RelayState.closed);
    });

    test('applies reported state from /get/accepted', () async {
      final model = await connectModel();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY4/get/accepted',
        jsonEncode({
          'state': {
            'reported': {'open_closed': 'open'},
            'desired': {'open_closed': 'open'}
          }
        }),
      );
      await Future<void>.delayed(Duration.zero);
      expect(model.reportedStateFor(4), RelayState.open);
    });

    test('logs desired-state messages without updating the cache', () async {
      final model = await connectModel();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY1/update/accepted',
        jsonEncode({
          'state': {
            'desired': {'open_closed': 'open'}
          }
        }),
      );
      await Future<void>.delayed(Duration.zero);
      expect(model.reportedStateFor(1), isNull);
      expect(
        logModel.messages.any((m) => m.contains('Relay 1 desired open')),
        isTrue,
      );
    });

    test('ignores deliveries that do not match a known relay topic', () async {
      final model = await connectModel();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/other/update/accepted',
        jsonEncode({'state': {'reported': {'open_closed': 'open'}}}),
      );
      await Future<void>.delayed(Duration.zero);
      for (final relay in AppConfig.relays) {
        expect(model.reportedStateFor(relay.relayId), isNull);
      }
    });

    test('logs and swallows malformed JSON', () async {
      await connectModel();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/RELAY1/update/accepted',
        '{not json',
      );
      await Future<void>.delayed(Duration.zero);
      expect(
        logModel.messages.any((m) => m.contains('Failed to decode shadow message')),
        isTrue,
      );
    });
  });

  group('ShadowRelayModel lifecycle', () {
    test('dispose removes the gateway listener', () async {
      final model = ShadowRelayModel(logModel, gateway);
      gateway.setConnectionState(MqttConnectivity.connected);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      model.dispose();
      // Now this should not crash; in particular no further subscribe/publish
      gateway.reset();
      gateway.setConnectionState(MqttConnectivity.disconnected);
      gateway.setConnectionState(MqttConnectivity.connected);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(gateway.subscriptions, isEmpty);
      expect(gateway.publishes, isEmpty);
    });
  });
}

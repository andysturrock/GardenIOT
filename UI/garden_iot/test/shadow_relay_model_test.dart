import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/shadow_relay_model.dart';

// ShadowRelayModel's interesting behaviour (TLS handshake, MQTT
// publish/subscribe, delta -> reportedState mapping) lives below the
// real mqtt_client / AWS IoT layer and is exercised by the skipped
// integration test under test/integration/. This file covers the bits
// that don't require a live broker: initial state and dispose.

void main() {
  late LogModel logModel;

  setUp(() {
    logModel = LogModel();
  });

  tearDown(() {
    logModel.dispose();
  });

  group('ShadowRelayModel (no MQTT)', () {
    test('starts disconnected and exposes correct state via getters', () {
      final model = ShadowRelayModel(logModel);
      expect(model.connectionState, MqttConnectivity.disconnected);
      expect(model.isConnected, isFalse);
    });

    test('reportedStateFor returns null for unknown relays', () {
      final model = ShadowRelayModel(logModel);
      expect(model.reportedStateFor(1), isNull);
      expect(model.reportedStateFor(999), isNull);
    });

    test('mqttDisconnect is a no-op when never connected', () async {
      final model = ShadowRelayModel(logModel);
      await expectLater(model.mqttDisconnect(), completes);
      expect(model.isConnected, isFalse);
    });

    test('setDesiredState logs + no-ops when not connected', () {
      final model = ShadowRelayModel(logModel);
      model.setDesiredState(1, RelayState.open);
      // The model logs the refusal; nothing thrown.
      expect(
        logModel.messages.any((m) => m.contains('not connected')),
        isTrue,
        reason: 'expected log line about not being connected',
      );
    });

    test('exposes the MqttConnectivity enum values app code branches on', () {
      expect(MqttConnectivity.values, hasLength(3));
      expect(MqttConnectivity.values, contains(MqttConnectivity.disconnected));
      expect(MqttConnectivity.values, contains(MqttConnectivity.connecting));
      expect(MqttConnectivity.values, contains(MqttConnectivity.connected));
    });
  });
}

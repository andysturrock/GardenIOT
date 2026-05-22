import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/water_now_button.dart';
import 'package:garden_iot/water_now_grid.dart';
import 'package:provider/provider.dart';

/// A ChangeNotifier-backed fake that satisfies the public surface of
/// ShadowRelayModel used by WaterNowGrid + WaterNowButton.
class FakeShadowRelayModel extends ChangeNotifier implements ShadowRelayModel {
  MqttConnectivity _state = MqttConnectivity.disconnected;
  final Map<int, RelayState> _reported = {};
  final List<({int relayId, RelayState desired})> setDesiredCalls = [];

  @override
  MqttConnectivity get connectionState => _state;

  @override
  bool get isConnected => _state == MqttConnectivity.connected;

  @override
  RelayState? reportedStateFor(int relayId) => _reported[relayId];

  @override
  void setDesiredState(int relayId, RelayState desired) {
    setDesiredCalls.add((relayId: relayId, desired: desired));
  }

  // Async methods not exercised by widget tests
  @override
  Future<bool> mqttConnect(AssetBundle bundle) async => true;
  @override
  Future<void> mqttDisconnect() async {}

  // Test helpers
  void simulateState(MqttConnectivity s) {
    _state = s;
    notifyListeners();
  }

  void simulateReported(int relayId, RelayState state) {
    _reported[relayId] = state;
    notifyListeners();
  }
}

Future<void> pumpGrid(WidgetTester tester, FakeShadowRelayModel model) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ChangeNotifierProvider<ShadowRelayModel>.value(
          value: model,
          child: const WaterNowGrid(),
        ),
      ),
    ),
  );
}

void main() {
  group('WaterNowGrid', () {
    testWidgets('renders one WaterNowButton per configured relay', (tester) async {
      final model = FakeShadowRelayModel()..simulateState(MqttConnectivity.connected);
      await pumpGrid(tester, model);
      expect(find.byType(WaterNowButton), findsNWidgets(AppConfig.relays.length));
    });

    testWidgets('shows the disconnected banner with a Retry button when not connected', (tester) async {
      final model = FakeShadowRelayModel();
      // initial state: disconnected
      await pumpGrid(tester, model);
      expect(find.text('Disconnected from broker'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
    });

    testWidgets('shows the "Connecting…" banner while connecting', (tester) async {
      final model = FakeShadowRelayModel()..simulateState(MqttConnectivity.connecting);
      await pumpGrid(tester, model);
      expect(find.text('Connecting…'), findsOneWidget);
    });

    testWidgets('hides any banner once connected', (tester) async {
      final model = FakeShadowRelayModel()..simulateState(MqttConnectivity.connected);
      await pumpGrid(tester, model);
      expect(find.text('Disconnected from broker'), findsNothing);
      expect(find.text('Connecting…'), findsNothing);
    });

    testWidgets('toggling a WaterNowButton calls setDesiredState on the model', (tester) async {
      final model = FakeShadowRelayModel()
        ..simulateState(MqttConnectivity.connected)
        ..simulateReported(1, RelayState.closed);
      await pumpGrid(tester, model);
      await tester.pumpAndSettle();

      // Find the first switch and tap it
      await tester.tap(find.byType(Switch).first);
      await tester.pump();
      expect(model.setDesiredCalls, isNotEmpty);
      // The first call should be for relay 1 going open
      expect(model.setDesiredCalls.first.desired, RelayState.open);
    });

    testWidgets('reactively re-renders when the model notifies', (tester) async {
      final model = FakeShadowRelayModel();
      await pumpGrid(tester, model);
      expect(find.text('Disconnected from broker'), findsOneWidget);

      model.simulateState(MqttConnectivity.connected);
      await tester.pumpAndSettle();

      expect(find.text('Disconnected from broker'), findsNothing);
      expect(find.byType(WaterNowButton), findsNWidgets(AppConfig.relays.length));
    });

    testWidgets('tapping Retry calls mqttConnect on the model', (tester) async {
      // Track whether mqttConnect was called by overriding the fake.
      final model = _RetryTrackingFake();
      await pumpGrid(tester, model);
      await tester.tap(find.text('Retry'));
      await tester.pump();
      expect(model.mqttConnectCalls, 1);
    });
  });
}

class _RetryTrackingFake extends FakeShadowRelayModel {
  int mqttConnectCalls = 0;

  @override
  Future<bool> mqttConnect(AssetBundle bundle) async {
    mqttConnectCalls += 1;
    return true;
  }
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/water_now_button.dart';
import 'package:garden_iot/water_now_grid.dart';
import 'package:provider/provider.dart';

import '../fakes/fake_mqtt_gateway.dart';

/// Provides the trio of types WaterNowGrid expects: the gateway (for the
/// Retry button), ShadowRelayModel, and GardenConfigModel. All three
/// share the same fake gateway so connection-state changes propagate.
Future<void> pumpGrid(
  WidgetTester tester, {
  required FakeMqttGateway gateway,
  required ShadowRelayModel relayModel,
  required GardenConfigModel configModel,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: MultiProvider(
          providers: [
            ListenableProvider<MqttGatewayLike>.value(value: gateway),
            ChangeNotifierProvider<ShadowRelayModel>.value(value: relayModel),
            ChangeNotifierProvider<GardenConfigModel>.value(value: configModel),
          ],
          child: const WaterNowGrid(),
        ),
      ),
    ),
  );
}

class _Setup {
  final LogModel logModel;
  final FakeMqttGateway gateway;
  final ShadowRelayModel relayModel;
  final GardenConfigModel configModel;

  _Setup(this.logModel, this.gateway, this.relayModel, this.configModel);

  void disposeAll() {
    relayModel.dispose();
    configModel.dispose();
    gateway.dispose();
    logModel.dispose();
  }
}

_Setup _buildSetup() {
  final logModel = LogModel();
  final gateway = FakeMqttGateway();
  return _Setup(
    logModel,
    gateway,
    ShadowRelayModel(logModel, gateway),
    GardenConfigModel(logModel, gateway),
  );
}

void main() {
  group('WaterNowGrid', () {
    testWidgets('renders one WaterNowButton per configured relay',
        (tester) async {
      final s = _buildSetup();
      s.gateway.setConnectionState(MqttConnectivity.connected);
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      expect(find.byType(WaterNowButton),
          findsNWidgets(AppConfig.relays.length));
      s.disposeAll();
    });

    testWidgets('shows the disconnected banner with a Retry button',
        (tester) async {
      final s = _buildSetup();
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      expect(find.text('Disconnected from broker'), findsOneWidget);
      expect(find.text('Retry'), findsOneWidget);
      s.disposeAll();
    });

    testWidgets('shows the "Connecting…" banner while connecting',
        (tester) async {
      final s = _buildSetup();
      s.gateway.setConnectionState(MqttConnectivity.connecting);
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      expect(find.text('Connecting…'), findsOneWidget);
      s.disposeAll();
    });

    testWidgets('hides any banner once connected', (tester) async {
      final s = _buildSetup();
      s.gateway.setConnectionState(MqttConnectivity.connected);
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      expect(find.text('Disconnected from broker'), findsNothing);
      expect(find.text('Connecting…'), findsNothing);
      s.disposeAll();
    });

    testWidgets('toggling a Switch publishes a desired update',
        (tester) async {
      final s = _buildSetup();
      s.gateway.setConnectionState(MqttConnectivity.connected);
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      await tester.pumpAndSettle();
      s.gateway.reset();

      await tester.tap(find.byType(Switch).first);
      await tester.pump();
      expect(s.gateway.publishes, isNotEmpty);
      final pub = s.gateway.publishes.first;
      expect(pub.topic, endsWith('/RELAY1/update'));
      expect(pub.payload, {
        'state': {
          'desired': {'open_closed': 'open'}
        }
      });
      s.disposeAll();
    });

    testWidgets('reactively re-renders when the gateway notifies',
        (tester) async {
      final s = _buildSetup();
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      expect(find.text('Disconnected from broker'), findsOneWidget);
      s.gateway.setConnectionState(MqttConnectivity.connected);
      await tester.pumpAndSettle();
      expect(find.text('Disconnected from broker'), findsNothing);
      expect(find.byType(WaterNowButton),
          findsNWidgets(AppConfig.relays.length));
      s.disposeAll();
    });

    testWidgets('uses bedName from GardenConfigModel for the relay label',
        (tester) async {
      final s = _buildSetup();
      s.gateway.setConnectionState(MqttConnectivity.connected);
      // Deliver a config with a renamed bed before pumping the widget.
      final cfg = defaultGardenConfig().copyWith(beds: {
        '1': const BedConfig(name: 'Tomatoes'),
        '2': const BedConfig(name: 'Flowers'),
        '3': const BedConfig(name: 'Strawberries'),
        '4': const BedConfig(name: 'Sweetcorn'),
      });
      s.gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/config/get/accepted',
        jsonEncode({
          'state': {'desired': cfg.toJson()},
          'version': 1,
        }),
      );
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      await tester.pumpAndSettle();
      expect(find.text('Tomatoes'), findsOneWidget);
      s.disposeAll();
    });

    testWidgets('falls back to Bed N before config arrives', (tester) async {
      final s = _buildSetup();
      s.gateway.setConnectionState(MqttConnectivity.connected);
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      await tester.pumpAndSettle();
      for (final relay in AppConfig.relays) {
        expect(find.text('Bed ${relay.relayId}'), findsOneWidget);
      }
      s.disposeAll();
    });

    testWidgets('tapping Retry calls mqttConnect on the gateway',
        (tester) async {
      final s = _buildSetup();
      await pumpGrid(tester,
          gateway: s.gateway,
          relayModel: s.relayModel,
          configModel: s.configModel);
      await tester.tap(find.text('Retry'));
      await tester.pump();
      expect(s.gateway.mqttConnectCalls, 1);
      s.disposeAll();
    });
  });
}

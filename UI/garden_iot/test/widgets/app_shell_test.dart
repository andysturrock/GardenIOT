import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/main.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

import '../fakes/fake_mqtt_gateway.dart';

class _Setup {
  final LogModel logModel;
  final FakeMqttGateway gateway;
  final TemperatureModel tempModel;
  final ShadowRelayModel relayModel;
  final GardenConfigModel configModel;

  _Setup(this.logModel, this.gateway, this.tempModel, this.relayModel,
      this.configModel);

  /// Tear the AppShell out of the tree (so its dispose runs while the
  /// providers are still live) BEFORE disposing the models themselves.
  Future<void> disposeAll(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox.shrink());
    tempModel.dispose();
    relayModel.dispose();
    configModel.dispose();
    gateway.dispose();
    logModel.dispose();
  }
}

_Setup _buildSetup() {
  final logModel = LogModel();
  final gateway = FakeMqttGateway();
  // TemperatureModel polls on a timer; a long period keeps the test
  // clock from firing it. The MockClient swallows the one initial GET
  // its constructor doesn't make until the first poll.
  final tempModel = TemperatureModel(
    const Duration(days: 1),
    logModel,
    httpClient: MockClient((_) async => http.Response('[]', 200)),
  );
  return _Setup(
    logModel,
    gateway,
    tempModel,
    ShadowRelayModel(logModel, gateway),
    GardenConfigModel(logModel, gateway),
  );
}

Future<void> _pumpShell(WidgetTester tester, _Setup s) {
  return tester.pumpWidget(
    MultiProvider(
      providers: [
        ChangeNotifierProvider<LogModel>.value(value: s.logModel),
        ListenableProvider<MqttGatewayLike>.value(value: s.gateway),
        ChangeNotifierProvider<TemperatureModel>.value(value: s.tempModel),
        ChangeNotifierProvider<ShadowRelayModel>.value(value: s.relayModel),
        ChangeNotifierProvider<GardenConfigModel>.value(value: s.configModel),
      ],
      child: const MaterialApp(home: AppShell()),
    ),
  );
}

void main() {
  group('AppShell MQTT lifecycle', () {
    testWidgets('connects on first build', (tester) async {
      final s = _buildSetup();
      await _pumpShell(tester, s);
      // didChangeDependencies queues a post-frame connect; pump to flush.
      await tester.pump();
      expect(s.gateway.mqttConnectCalls, 1);
      await s.disposeAll(tester);
    });

    testWidgets('reconnects when the app returns to the foreground',
        (tester) async {
      final s = _buildSetup();
      await _pumpShell(tester, s);
      await tester.pump();
      expect(s.gateway.mqttConnectCalls, 1);

      // Simulate Android suspending then resuming the app. The MQTT
      // keepalive expires while paused so the gateway drops to
      // disconnected; on resume we expect a fresh connect.
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.paused);
      s.gateway.setConnectionState(MqttConnectivity.disconnected);
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();

      expect(s.gateway.mqttConnectCalls, 2);
      await s.disposeAll(tester);
    });

    testWidgets('does not reconnect on resume if still connected',
        (tester) async {
      final s = _buildSetup();
      await _pumpShell(tester, s);
      await tester.pump();
      expect(s.gateway.mqttConnectCalls, 1);

      // Connected state survived the pause (fast app-switch). Resume
      // should not trigger an extra mqttConnect.
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      await tester.pump();

      expect(s.gateway.mqttConnectCalls, 1);
      await s.disposeAll(tester);
    });

    testWidgets('ignores non-resume lifecycle transitions', (tester) async {
      final s = _buildSetup();
      await _pumpShell(tester, s);
      await tester.pump();
      s.gateway.setConnectionState(MqttConnectivity.disconnected);

      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.inactive);
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.paused);
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.hidden);
      tester.binding
          .handleAppLifecycleStateChanged(AppLifecycleState.detached);
      await tester.pump();

      // First connect only — the four non-resumed transitions are no-ops.
      expect(s.gateway.mqttConnectCalls, 1);
      await s.disposeAll(tester);
    });

    testWidgets('disconnects on dispose', (tester) async {
      final s = _buildSetup();
      await _pumpShell(tester, s);
      await tester.pump();

      // Pump an empty widget tree so AppShell is removed and disposed.
      await tester.pumpWidget(const SizedBox.shrink());
      expect(s.gateway.mqttDisconnectCalls, 1);
      await s.disposeAll(tester);
    });
  });
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/schedule_editor.dart';
import 'package:garden_iot/schedule_screen.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:provider/provider.dart';

import '../fakes/fake_mqtt_gateway.dart';

/// Seed the model's config without waiting on real wall time.
///
/// `_onGatewayChange` attaches the delivery listener synchronously the
/// first time the gateway connects, so we can deliver `get/accepted`
/// straight away — no need to await the 500ms publish-get guard timer.
/// `tester.pump()` advances the fake clock by 0 and flushes microtasks,
/// which is enough for the broadcast stream to hand the message to the
/// model.
Future<void> _seedConfig(
  WidgetTester tester,
  FakeMqttGateway gateway,
  GardenConfig cfg,
) async {
  gateway.setConnectionState(MqttConnectivity.connected);
  // Drain the 500ms _publishGet guard timer so the framework doesn't
  // flag it as still pending after the test ends.
  await tester.pump(const Duration(milliseconds: 500));
  gateway.deliver(
    '\$aws/things/${AppConfig.deviceId}/shadow/name/config/get/accepted',
    jsonEncode({
      'state': {'desired': cfg.toJson()},
      'version': 1,
    }),
  );
  await tester.pump();
}

Future<void> _pumpScreen(
  WidgetTester tester, {
  required GardenConfigModel model,
}) {
  // Provider must live ABOVE MaterialApp so routes pushed by the
  // screen's Navigator (e.g. the editor) can still find it.
  return tester.pumpWidget(
    ChangeNotifierProvider<GardenConfigModel>.value(
      value: model,
      child: const MaterialApp(home: ScheduleScreen()),
    ),
  );
}

void main() {
  late LogModel logModel;
  late FakeMqttGateway gateway;
  late GardenConfigModel model;

  setUp(() {
    logModel = LogModel();
    gateway = FakeMqttGateway();
    model = GardenConfigModel(logModel, gateway);
  });

  tearDown(() {
    model.dispose();
    gateway.dispose();
    logModel.dispose();
  });

  group('ScheduleScreen', () {
    testWidgets('shows a spinner while config is loading', (tester) async {
      await _pumpScreen(tester, model: model);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('renders a tile per job once config has loaded',
        (tester) async {
      await _seedConfig(tester, gateway, defaultGardenConfig());
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();
      // Default config has 2 jobs.
      expect(find.text('Morning veg'), findsOneWidget);
      expect(find.text('Morning fruit'), findsOneWidget);
      // Time + duration summary appears once per tile.
      expect(find.text('08:00 • 5 min'), findsOneWidget);
      expect(find.text('08:10 • 5 min'), findsOneWidget);
      // Bed names rendered (relays 1,2 for morning veg).
      expect(find.text('Greenhouse, Flowers'), findsOneWidget);
    });

    testWidgets('shows empty state when there are no jobs', (tester) async {
      final cfg = defaultGardenConfig().copyWith(jobs: const []);
      await _seedConfig(tester, gateway, cfg);
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();
      expect(find.text('No watering jobs yet'), findsOneWidget);
    });

    testWidgets('FAB pushes the editor for a new job', (tester) async {
      await _seedConfig(tester, gateway, defaultGardenConfig());
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();
      await tester.tap(find.text('New job'));
      await tester.pumpAndSettle();
      expect(find.byType(ScheduleEditor), findsOneWidget);
      expect(find.text('New job'), findsOneWidget); // app bar title
    });

    testWidgets('tapping a tile pushes the editor with that job',
        (tester) async {
      await _seedConfig(tester, gateway, defaultGardenConfig());
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Morning veg'));
      await tester.pumpAndSettle();
      expect(find.text('Edit job'), findsOneWidget);
      // Name field prefilled.
      expect(find.widgetWithText(TextField, 'Morning veg'), findsOneWidget);
    });

    testWidgets('swiping a tile publishes a delete and shows undo snackbar',
        (tester) async {
      await _seedConfig(tester, gateway, defaultGardenConfig());
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();

      await tester.drag(
          find.text('Morning veg'), const Offset(-500, 0));
      await tester.pumpAndSettle();

      // Delete published.
      expect(gateway.publishes, hasLength(1));
      final desired =
          ((gateway.publishes.first.payload as Map)['state'] as Map)['desired']
              as Map;
      final jobs = (desired['jobs'] as List).cast<Map>();
      expect(jobs, hasLength(1));
      expect(jobs.single['name'], 'Morning fruit');

      // Undo snackbar appears.
      expect(find.text('Deleted "Morning veg"'), findsOneWidget);
      expect(find.text('Undo'), findsOneWidget);
    });

    testWidgets('tapping Undo re-publishes the deleted job', (tester) async {
      await _seedConfig(tester, gateway, defaultGardenConfig());
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();

      await tester.drag(
          find.text('Morning veg'), const Offset(-500, 0));
      await tester.pumpAndSettle();
      // delete = publish #1
      await tester.tap(find.text('Undo'));
      await tester.pump();
      // undo = publish #2
      expect(gateway.publishes, hasLength(2));
      final desired =
          ((gateway.publishes[1].payload as Map)['state'] as Map)['desired']
              as Map;
      final jobs = (desired['jobs'] as List).cast<Map>();
      expect(jobs, hasLength(2));
      expect(jobs.map((j) => j['name']),
          containsAll(['Morning veg', 'Morning fruit']));
    });

    testWidgets('bed names in tiles come from the live config',
        (tester) async {
      final cfg = defaultGardenConfig().copyWith(beds: {
        '1': const BedConfig(name: 'Tomatoes'),
        '2': const BedConfig(name: 'Peppers'),
        '3': const BedConfig(name: 'Strawberries'),
        '4': const BedConfig(name: 'Sweetcorn'),
      });
      await _seedConfig(tester, gateway, cfg);
      gateway.reset();
      await _pumpScreen(tester, model: model);
      await tester.pumpAndSettle();
      expect(find.text('Tomatoes, Peppers'), findsOneWidget);
    });
  });
}

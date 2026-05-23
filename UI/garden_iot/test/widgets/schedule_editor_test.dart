import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/schedule_editor.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:provider/provider.dart';

import '../fakes/fake_mqtt_gateway.dart';

/// Seed the model's config inside the test's fake-async zone — `tester.pump()`
/// flushes microtasks so the broadcast stream delivers to the model
/// without waiting on real wall time.
Future<void> _seedConfig(WidgetTester tester, FakeMqttGateway gateway) async {
  gateway.setConnectionState(MqttConnectivity.connected);
  // Drain the 500ms _publishGet guard timer so the framework doesn't
  // flag it as still pending after the test ends.
  await tester.pump(const Duration(milliseconds: 500));
  gateway.deliver(
    '\$aws/things/${AppConfig.deviceId}/shadow/name/config/get/accepted',
    jsonEncode({
      'state': {'desired': defaultGardenConfig().toJson()},
      'version': 1,
    }),
  );
  await tester.pump();
}

Future<void> _pumpEditor(
  WidgetTester tester, {
  required GardenConfigModel model,
  required FakeMqttGateway gateway,
  WateringJobConfig? initial,
}) async {
  await _seedConfig(tester, gateway);
  gateway.reset();
  await tester.pumpWidget(
    ChangeNotifierProvider<GardenConfigModel>.value(
      value: model,
      child: MaterialApp(home: ScheduleEditor(initial: initial)),
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

  group('ScheduleEditor', () {
    testWidgets('new job: title says "New job" and Save is disabled initially',
        (tester) async {
      await _pumpEditor(tester, model: model, gateway: gateway);
      expect(find.text('New job'), findsOneWidget);
      final save = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Save'));
      expect(save.onPressed, isNull);
    });

    testWidgets('edit existing: prefills name, days, time, duration, beds',
        (tester) async {
      final job = defaultGardenConfig().jobs.first;
      await _pumpEditor(tester, model: model, gateway: gateway, initial: job);
      expect(find.text('Edit job'), findsOneWidget);
      expect(find.widgetWithText(TextField, job.name!), findsOneWidget);
      // Time renders as HH:mm
      expect(find.text('08:00'), findsOneWidget);
      expect(find.text('10 min'), findsOneWidget);
    });

    testWidgets('Save publishes upsert with the right job', (tester) async {
      await _pumpEditor(tester, model: model, gateway: gateway);

      await tester.enterText(find.byType(TextField), 'Test job');
      await tester.pump();

      // Select Monday + Wednesday (ISO days 1 and 3)
      await tester.tap(find.widgetWithText(FilterChip, 'M').first);
      await tester.pump();
      await tester.tap(find.widgetWithText(FilterChip, 'W').first);
      await tester.pump();

      // Tap the first bed chip (relay 1 → "Greenhouse" via the seeded config)
      await tester.tap(find.widgetWithText(FilterChip, 'Greenhouse'));
      await tester.pump();

      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(gateway.publishes, hasLength(1));
      final pub = gateway.publishes.first;
      expect(pub.topic, endsWith('/config/update'));
      final desired =
          ((pub.payload as Map)['state'] as Map)['desired'] as Map;
      final jobs = desired['jobs'] as List;
      // 2 default jobs + the new one
      expect(jobs, hasLength(3));
      final added = jobs.last as Map;
      expect(added['name'], 'Test job');
      expect(added['days'], [1, 3]);
      expect(added['relays'], [1]);
      expect(added['hour'], 8);
      expect(added['minute'], 0);
      expect(added['duration_s'], 300);
    });

    testWidgets('Save is disabled when name is empty', (tester) async {
      await _pumpEditor(tester, model: model, gateway: gateway);
      // Even after selecting days + beds, name empty keeps Save disabled.
      await tester.tap(find.widgetWithText(FilterChip, 'M').first);
      await tester.tap(find.widgetWithText(FilterChip, 'Greenhouse'));
      await tester.pump();
      final save = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Save'));
      expect(save.onPressed, isNull);
    });

    testWidgets('Save is disabled when no days selected', (tester) async {
      final job = defaultGardenConfig().jobs.first; // has all 7 days
      await _pumpEditor(tester, model: model, gateway: gateway, initial: job);
      // Deselect all 7 day chips — they're the first 7 FilterChips on the
      // screen (bed chips follow). Tapping by label would re-toggle days
      // that share a letter (T/T, S/S).
      for (var i = 0; i < 7; i++) {
        await tester.tap(find.byType(FilterChip).at(i));
        await tester.pump();
      }
      final save = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Save'));
      expect(save.onPressed, isNull);
    });

    testWidgets('Save is disabled when no beds selected', (tester) async {
      final job = defaultGardenConfig().jobs.first; // relays 1,2
      await _pumpEditor(tester, model: model, gateway: gateway, initial: job);
      // Deselect the two selected beds.
      await tester.tap(find.widgetWithText(FilterChip, 'Greenhouse'));
      await tester.pump();
      await tester.tap(find.widgetWithText(FilterChip, 'Flowers'));
      await tester.pump();
      final save = tester.widget<TextButton>(find.widgetWithText(TextButton, 'Save'));
      expect(save.onPressed, isNull);
    });

    testWidgets('changing the duration slider updates the label',
        (tester) async {
      await _pumpEditor(tester, model: model, gateway: gateway);
      expect(find.text('5 min'), findsOneWidget); // default 300s → 5 min
      // Drag the slider to its max.
      await tester.drag(find.byType(Slider), const Offset(500, 0));
      await tester.pump();
      expect(find.text('30 min'), findsAtLeastNWidgets(1));
    });

    testWidgets('toggling a day chip flips selection state', (tester) async {
      await _pumpEditor(tester, model: model, gateway: gateway);
      // Initial: no days selected (new job).
      // Tap Monday on, then off.
      await tester.tap(find.widgetWithText(FilterChip, 'M').first);
      await tester.pump();
      var monday =
          tester.widget<FilterChip>(find.widgetWithText(FilterChip, 'M').first);
      expect(monday.selected, isTrue);

      await tester.tap(find.widgetWithText(FilterChip, 'M').first);
      await tester.pump();
      monday =
          tester.widget<FilterChip>(find.widgetWithText(FilterChip, 'M').first);
      expect(monday.selected, isFalse);
    });

    testWidgets('edits to an existing job preserve its id', (tester) async {
      final job = defaultGardenConfig().jobs.first;
      await _pumpEditor(tester, model: model, gateway: gateway, initial: job);
      await tester.enterText(find.byType(TextField), 'Renamed');
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();
      expect(gateway.publishes, hasLength(1));
      final desired =
          ((gateway.publishes.first.payload as Map)['state'] as Map)['desired']
              as Map;
      final jobs = (desired['jobs'] as List).cast<Map>();
      final updated = jobs.firstWhere((j) => j['id'] == job.id);
      expect(updated['name'], 'Renamed');
      // Still only 2 jobs (we replaced, not added).
      expect(jobs, hasLength(2));
    });
  });
}

import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/bed_rename_sheet.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:provider/provider.dart';

import '../fakes/fake_mqtt_gateway.dart';

/// Pumps a host widget that owns a Builder so the test can tap a button
/// to open the bottom sheet with the right `context`.
Future<void> pumpHost(
  WidgetTester tester, {
  required GardenConfigModel model,
  required int relayId,
  required String initialName,
  ValueChanged<String?>? onResult,
}) {
  return tester.pumpWidget(
    ChangeNotifierProvider<GardenConfigModel>.value(
      value: model,
      child: MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (ctx) => Center(
              child: ElevatedButton(
                onPressed: () async {
                  final result = await BedRenameSheet.show(
                    ctx,
                    relayId: relayId,
                    initialName: initialName,
                  );
                  if (onResult != null) onResult(result);
                },
                child: const Text('Open sheet'),
              ),
            ),
          ),
        ),
      ),
    ),
  );
}

void main() {
  late LogModel logModel;
  late FakeMqttGateway gateway;
  late GardenConfigModel model;

  setUp(() async {
    logModel = LogModel();
    gateway = FakeMqttGateway();
    model = GardenConfigModel(logModel, gateway);
    // Pre-load a config so renameBed has something to mutate.
    gateway.setConnectionState(MqttConnectivity.connected);
    await Future<void>.delayed(const Duration(milliseconds: 600));
    gateway.deliver(
      '\$aws/things/${AppConfig.deviceId}/shadow/name/config/get/accepted',
      jsonEncode({
        'state': {'desired': defaultGardenConfig().toJson()},
        'version': 1,
      }),
    );
    await Future<void>.delayed(Duration.zero);
    gateway.reset();
  });

  tearDown(() {
    model.dispose();
    gateway.dispose();
    logModel.dispose();
  });

  group('BedRenameSheet', () {
    testWidgets('prefills with the current bed name', (tester) async {
      await pumpHost(tester,
          model: model, relayId: 1, initialName: 'Greenhouse');
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      final field = tester.widget<TextField>(find.byType(TextField));
      expect(field.controller!.text, 'Greenhouse');
      expect(find.text('Rename bed'), findsOneWidget);
      expect(find.text('Cancel'), findsOneWidget);
      expect(find.text('Save'), findsOneWidget);
    });

    testWidgets('Save publishes a renameBed and closes', (tester) async {
      String? result;
      await pumpHost(tester,
          model: model,
          relayId: 2,
          initialName: 'Flowers',
          onResult: (r) => result = r);
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Roses');
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      expect(result, 'Roses');
      expect(gateway.publishes, hasLength(1));
      final payload = gateway.publishes.first.payload as Map<String, dynamic>;
      final desired = (payload['state'] as Map)['desired'] as Map;
      expect(((desired['beds'] as Map)['2'] as Map)['name'], 'Roses');
    });

    testWidgets('Cancel pops without publishing', (tester) async {
      String? result = 'initial';
      await pumpHost(tester,
          model: model,
          relayId: 1,
          initialName: 'Greenhouse',
          onResult: (r) => result = r);
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      await tester.tap(find.text('Cancel'));
      await tester.pumpAndSettle();
      expect(result, isNull);
      expect(gateway.publishes, isEmpty);
    });

    testWidgets('Save button is disabled when the name is empty',
        (tester) async {
      await pumpHost(tester,
          model: model, relayId: 1, initialName: 'Greenhouse');
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '   ');
      await tester.pump();
      final save = tester.widget<FilledButton>(find.byType(FilledButton));
      expect(save.onPressed, isNull);
    });

    testWidgets('pressing enter in the field saves when valid',
        (tester) async {
      String? result;
      await pumpHost(tester,
          model: model,
          relayId: 3,
          initialName: 'Strawberries',
          onResult: (r) => result = r);
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), 'Raspberries');
      await tester.pump();
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();

      expect(result, 'Raspberries');
      expect(gateway.publishes, hasLength(1));
    });

    testWidgets('pressing enter on an empty field does not save',
        (tester) async {
      String? result = 'initial';
      await pumpHost(tester,
          model: model,
          relayId: 1,
          initialName: 'Greenhouse',
          onResult: (r) => result = r);
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      await tester.enterText(find.byType(TextField), '   ');
      await tester.pump();
      await tester.testTextInput.receiveAction(TextInputAction.done);
      await tester.pumpAndSettle();
      // Sheet should still be visible because submit was rejected.
      expect(find.text('Rename bed'), findsOneWidget);
      expect(result, 'initial');
    });

    testWidgets('full round-trip: rename publishes, AWS update/documents reply updates the model',
        (tester) async {
      await pumpHost(tester,
          model: model, relayId: 1, initialName: 'Greenhouse');
      await tester.tap(find.text('Open sheet'));
      await tester.pumpAndSettle();

      // Sanity: the model has the original name before we rename.
      expect(model.bedName(1), 'Greenhouse');

      await tester.enterText(find.byType(TextField), 'Tomatoes');
      await tester.pump();
      await tester.tap(find.text('Save'));
      await tester.pumpAndSettle();

      // The publish went out.
      expect(gateway.publishes, hasLength(1));
      final pub = gateway.publishes.first;
      expect(pub.topic, endsWith('/config/update'));
      final desired = ((pub.payload as Map)['state'] as Map)['desired'] as Map;
      final newConfig =
          GardenConfig.fromJson(Map<String, dynamic>.from(desired));
      expect(newConfig.beds['1']!.name, 'Tomatoes');

      // Simulate the AWS round-trip: an update/documents with the new
      // desired (this is what the real broker sends after the update is
      // accepted). The partial /update/delta that AWS also sends would
      // never round-trip the change on its own — that was the original
      // bug.
      final prev = defaultGardenConfig();
      gateway.deliver(
        '\$aws/things/${AppConfig.deviceId}/shadow/name/config/update/documents',
        jsonEncode({
          'previous': {
            'state': {'desired': prev.toJson(), 'reported': prev.toJson()},
            'version': 1,
          },
          'current': {
            'state': {'desired': newConfig.toJson(), 'reported': prev.toJson()},
            'version': 2,
          },
        }),
      );
      await tester.pump();

      expect(model.bedName(1), 'Tomatoes');
    });
  });
}

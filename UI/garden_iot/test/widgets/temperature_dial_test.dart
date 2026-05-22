import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

const _sensor = SensorConfig(name: 'Greenhouse', sensorId: 1);

Future<void> pumpDial(
  WidgetTester tester, {
  required TemperatureModel model,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ChangeNotifierProvider<TemperatureModel>.value(
          value: model,
          child: const TemperatureDial(sensor: _sensor),
        ),
      ),
    ),
  );
}

void main() {
  late LogModel logModel;

  setUp(() {
    logModel = LogModel();
  });

  tearDown(() {
    logModel.dispose();
  });

  group('TemperatureDial', () {
    testWidgets('renders the sensor name', (tester) async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((_) async => http.Response('[]', 200)),
      );
      await pumpDial(tester, model: model);
      expect(find.text('Greenhouse'), findsOneWidget);
      model.dispose();
    });

    testWidgets('shows "—" placeholder when no reading is available', (tester) async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((_) async => http.Response('[]', 200)),
      );
      await pumpDial(tester, model: model);
      await tester.pump();
      expect(find.text('—'), findsOneWidget);
      model.dispose();
    });

    testWidgets('shows the temperature with degree symbol once a reading lands', (tester) async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((_) async => http.Response(
          jsonEncode([
            {'sensor_id': 1, 'temperature': 18.5, 'timestamp': 1700000000000},
          ]),
          200,
        )),
      );
      await pumpDial(tester, model: model);
      // Wait for the unawaited initial poll + a frame so the Consumer rebuilds
      await tester.pumpAndSettle();
      expect(find.text('18.5°'), findsOneWidget);
      model.dispose();
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/dials_grid.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

void main() {
  late LogModel logModel;
  late TemperatureModel tempModel;

  setUp(() {
    logModel = LogModel();
    tempModel = TemperatureModel(
      const Duration(days: 1),
      logModel,
      httpClient: MockClient((_) async => http.Response('[]', 200)),
    );
  });

  tearDown(() {
    tempModel.dispose();
    logModel.dispose();
  });

  Future<void> pumpGrid(WidgetTester tester) {
    return tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ChangeNotifierProvider<TemperatureModel>.value(
            value: tempModel,
            child: const DialsGrid(),
          ),
        ),
      ),
    );
  }

  group('DialsGrid', () {
    testWidgets('renders one TemperatureDial per configured sensor', (tester) async {
      await pumpGrid(tester);
      expect(find.byType(TemperatureDial), findsNWidgets(AppConfig.sensors.length));
    });

    testWidgets('each dial shows its sensor name', (tester) async {
      await pumpGrid(tester);
      for (final s in AppConfig.sensors) {
        expect(find.text(s.name), findsOneWidget);
      }
    });

    testWidgets('shows the empty-state message when given no sensors', (tester) async {
      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: ChangeNotifierProvider<TemperatureModel>.value(
              value: tempModel,
              child: const DialsGrid(sensors: <SensorConfig>[]),
            ),
          ),
        ),
      );
      expect(find.text('No sensors configured.'), findsOneWidget);
      expect(find.byType(TemperatureDial), findsNothing);
    });
  });
}

import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  late LogModel logModel;

  setUp(() {
    logModel = LogModel();
  });

  tearDown(() {
    logModel.dispose();
  });

  group('TemperatureReading.fromJson', () {
    test('parses numeric fields as-is', () {
      final r = TemperatureReading.fromJson({'sensor_id': 1, 'temperature': 18.5});
      expect(r.sensorId, 1);
      expect(r.temperature, 18.5);
    });

    test('parses stringified numeric fields (legacy backend behaviour)', () {
      final r = TemperatureReading.fromJson({'sensor_id': '2', 'temperature': '12.3'});
      expect(r.sensorId, 2);
      expect(r.temperature, 12.3);
    });

    test('toString includes sensor_id and temperature', () {
      const r = TemperatureReading(7, 19.4);
      expect(r.toString(), contains('7'));
      expect(r.toString(), contains('19.4'));
    });
  });

  group('TemperatureModel', () {
    /// Build a MockClient that returns a fixed body and 200.
    http.Client okClientReturning(List<Map<String, dynamic>> readings) {
      return MockClient((request) async {
        return http.Response(jsonEncode(readings), 200);
      });
    }

    test('readingFor() returns null before the first poll', () {
      // Use a slow poll period so no real fetch happens during the test.
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((_) async => http.Response('[]', 200)),
      );
      expect(model.readingFor(1), isNull);
      model.dispose();
    });

    test('populates readings from the HTTP response on the initial poll', () async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: okClientReturning([
          {'sensor_id': 1, 'temperature': 20.0, 'timestamp': 1700000000000},
          {'sensor_id': 2, 'temperature': 11.5, 'timestamp': 1700000000500},
        ]),
      );
      // Wait for the unawaited initial poll
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      final r1 = model.readingFor(1);
      expect(r1, isNotNull);
      expect(r1!.temperature, 20.0);
      expect(model.readingFor(2)!.temperature, 11.5);
      model.dispose();
    });

    test('hits the temperature API with one sensor_idN key per configured sensor', () async {
      Uri? capturedUri;
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((req) async {
          capturedUri = req.url;
          return http.Response('[]', 200);
        }),
      );
      await Future<void>.delayed(Duration.zero);

      expect(capturedUri, isNotNull);
      expect(capturedUri!.host, AppConfig.temperatureApiHost);
      expect(capturedUri!.path, AppConfig.temperatureApiPath);
      // One query parameter per configured sensor, keys shaped like "sensor_idN".
      for (final s in AppConfig.sensors) {
        expect(capturedUri!.queryParameters.containsKey('sensor_id${s.sensorId}'), isTrue);
      }
      model.dispose();
    });

    test('logs non-200 responses without crashing', () async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((_) async => http.Response('upstream broken', 502)),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      expect(logModel.messages.any((m) => m.contains('HTTP 502')), isTrue);
      expect(model.readingFor(1), isNull);
      model.dispose();
    });

    test('logs thrown errors without crashing', () async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: MockClient((_) async => throw Exception('network down')),
      );
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);

      expect(logModel.messages.any((m) => m.contains('Temperature fetch error')), isTrue);
      model.dispose();
    });

    test('notifyListeners fires after a successful poll', () async {
      final model = TemperatureModel(
        const Duration(days: 1),
        logModel,
        httpClient: okClientReturning([
          {'sensor_id': 1, 'temperature': 15.0, 'timestamp': 1700000000000},
        ]),
      );
      var notified = 0;
      model.addListener(() => notified++);
      await Future<void>.delayed(Duration.zero);
      await Future<void>.delayed(Duration.zero);
      expect(notified, greaterThanOrEqualTo(1));
      model.dispose();
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/utils/env.dart';

void main() {
  group('SensorConfig', () {
    test('exposes name + sensorId and sensible default ranges', () {
      const s = SensorConfig(name: 'Greenhouse', sensorId: 1);
      expect(s.name, 'Greenhouse');
      expect(s.sensorId, 1);
      expect(s.minTemp, -10);
      expect(s.maxTemp, 50);
      expect(s.minComfort, 10);
      expect(s.maxComfort, 25);
    });

    test('range fields can be overridden per sensor', () {
      const s = SensorConfig(
        name: 'Polar',
        sensorId: 9,
        minTemp: -40,
        maxTemp: 0,
        minComfort: -30,
        maxComfort: -5,
      );
      expect(s.minTemp, -40);
      expect(s.maxTemp, 0);
      expect(s.minComfort, -30);
      expect(s.maxComfort, -5);
    });
  });

  group('RelayConfig', () {
    test('exposes relayId and default icon (spa)', () {
      const r = RelayConfig(relayId: 1);
      expect(r.relayId, 1);
      expect(r.icon, IconCodepoint.spa);
    });

    test('icon can be overridden', () {
      const r = RelayConfig(relayId: 2, icon: IconCodepoint.grass);
      expect(r.icon, IconCodepoint.grass);
    });
  });

  group('AppConfig', () {
    test('exposes the prod cert + key + Amazon root CA asset paths', () {
      expect(AppConfig.rootCAPath, contains('AmazonRootCA1.pem'));
      expect(AppConfig.deviceCertPath, contains('certificate.pem.crt'));
      expect(AppConfig.privateKeyPath, contains('private.pem.key'));
    });

    test('exposes the prod IoT endpoint, client id + topics', () {
      expect(AppConfig.iotEndPoint, contains('iot.eu-west-1.amazonaws.com'));
      expect(AppConfig.clientId, isNotEmpty);
      expect(AppConfig.deviceId, isNotEmpty);
      expect(AppConfig.deviceLoggingTopic, endsWith('/logging'));
    });

    test('temperature API host + path are set', () {
      expect(AppConfig.temperatureApiHost, isNotEmpty);
      expect(AppConfig.temperatureApiPath, startsWith('/'));
    });

    test('mqttLogging is disabled in prod (avoids self-recursion via MQTT logs)', () {
      expect(AppConfig.mqttLogging, isFalse);
    });

    test('sensors list is non-empty and every entry has a positive sensorId', () {
      expect(AppConfig.sensors, isNotEmpty);
      for (final s in AppConfig.sensors) {
        expect(s.sensorId, greaterThan(0));
        expect(s.name, isNotEmpty);
      }
    });

    test('relays list has 4 entries matching the PiRelay V2 hardware', () {
      expect(AppConfig.relays, hasLength(4));
      final ids = AppConfig.relays.map((r) => r.relayId).toSet();
      expect(ids, equals({1, 2, 3, 4}));
    });

    test('IconCodepoint enum has the four icons used by the relay configs', () {
      expect(IconCodepoint.values, hasLength(4));
      expect(IconCodepoint.values, contains(IconCodepoint.spa));
      expect(IconCodepoint.values, contains(IconCodepoint.localFlorist));
      expect(IconCodepoint.values, contains(IconCodepoint.agriculture));
      expect(IconCodepoint.values, contains(IconCodepoint.grass));
    });
  });
}

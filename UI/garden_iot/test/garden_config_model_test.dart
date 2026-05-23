import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/utils/env.dart';

import 'fakes/fake_mqtt_gateway.dart';

const _base = '\$aws/things/raspberrypi-1/shadow/name/config';

void main() {
  late LogModel logModel;
  late FakeMqttGateway gateway;

  setUp(() {
    logModel = LogModel();
    gateway = FakeMqttGateway();
  });

  tearDown(() {
    gateway.dispose();
    logModel.dispose();
  });

  Future<GardenConfigModel> connect() async {
    final model = GardenConfigModel(logModel, gateway);
    gateway.setConnectionState(MqttConnectivity.connected);
    await Future<void>.delayed(const Duration(milliseconds: 600));
    return model;
  }

  group('initial state', () {
    test('config is null until first delivery', () {
      final model = GardenConfigModel(logModel, gateway);
      expect(model.config, isNull);
      expect(model.jobs, isEmpty);
      expect(model.bedName(1), 'Bed 1');
    });
  });

  group('on connect', () {
    test('subscribes to all six config-shadow topics', () async {
      await connect();
      expect(gateway.subscriptions, containsAll([
        '$_base/get/accepted',
        '$_base/get/rejected',
        '$_base/update/accepted',
        '$_base/update/rejected',
        '$_base/update/delta',
        '$_base/update/documents',
      ]));
    });

    test('publishes a get after the 500ms guard', () async {
      await connect();
      final gets = gateway.publishes.where((p) => p.topic == '$_base/get').toList();
      expect(gets, hasLength(1));
    });

    test('does not publish get if dropped while waiting', () async {
      GardenConfigModel(logModel, gateway);
      gateway.setConnectionState(MqttConnectivity.connected);
      gateway.setConnectionState(MqttConnectivity.disconnected);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(gateway.publishes.where((p) => p.topic == '$_base/get'), isEmpty);
    });
  });

  group('get/accepted', () {
    test('applies desired when present and updates bedName', () async {
      final model = await connect();
      final cfg = defaultGardenConfig().copyWith(beds: {
        '1': const BedConfig(name: 'Tomatoes'),
        '2': const BedConfig(name: 'Carrots'),
        '3': const BedConfig(name: 'Berries'),
        '4': const BedConfig(name: 'Herbs'),
      });
      gateway.deliver('$_base/get/accepted', jsonEncode({
        'state': {'desired': cfg.toJson(), 'reported': cfg.toJson()},
        'version': 3,
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNotNull);
      expect(model.bedName(1), 'Tomatoes');
      expect(model.jobs, hasLength(2));
    });

    test('falls back to reported when desired is absent', () async {
      final model = await connect();
      gateway.deliver('$_base/get/accepted', jsonEncode({
        'state': {'reported': defaultGardenConfig().toJson()},
        'version': 1,
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.bedName(1), 'Greenhouse');
    });

    test('logs and waits when state is empty', () async {
      await connect();
      gateway.deliver('$_base/get/accepted', jsonEncode({'state': {}}));
      await Future<void>.delayed(Duration.zero);
      expect(
        logModel.messages.any((m) => m.contains('Config shadow empty')),
        isTrue,
      );
    });

    test('logs invalid configs without changing state', () async {
      final model = await connect();
      gateway.deliver('$_base/get/accepted', jsonEncode({
        'state': {
          'desired': {'version': 99, 'beds': {}, 'jobs': [], 'tz': 'UTC'}
        },
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
      expect(
        logModel.messages.any((m) => m.contains('Invalid config from get/accepted')),
        isTrue,
      );
    });

    test('ignores non-map state payloads', () async {
      final model = await connect();
      gateway.deliver('$_base/get/accepted', jsonEncode({'state': 'oops'}));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
    });
  });

  group('get/rejected', () {
    test('logs without crashing on 404 (Pi will seed)', () async {
      await connect();
      gateway.deliver('$_base/get/rejected', jsonEncode({'code': 404}));
      await Future<void>.delayed(Duration.zero);
      expect(
        logModel.messages.any((m) => m.contains('not yet seeded')),
        isTrue,
      );
    });

    test('logs non-404 codes', () async {
      await connect();
      gateway.deliver('$_base/get/rejected',
          jsonEncode({'code': 401, 'message': 'forbidden'}));
      await Future<void>.delayed(Duration.zero);
      expect(
        logModel.messages.any((m) => m.contains('get rejected')),
        isTrue,
      );
    });
  });

  group('update/delta', () {
    // AWS IoT deltas carry only the changed fields, never a full GardenConfig,
    // so we deliberately ignore them for apply purposes and rely on
    // update/documents. The handler only bumps the version counter.
    test('never applies, even with a full-state payload', () async {
      final model = await connect();
      gateway.deliver('$_base/update/delta', jsonEncode({
        'state': defaultGardenConfig().toJson(),
        'version': 5,
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
    });

    test('partial delta (the realistic AWS payload) is a no-op', () async {
      final model = await connect();
      gateway.deliver('$_base/update/delta', jsonEncode({
        'state': {'beds': {'1': {'name': 'Tomatoes'}}},
        'version': 5,
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
    });
  });

  group('update/documents', () {
    test('applies current.state.desired when it differs from previous', () async {
      final model = await connect();
      final prev = defaultGardenConfig();
      final next = prev.copyWith(beds: {
        ...prev.beds,
        '1': const BedConfig(name: 'Tomatoes'),
      });
      gateway.deliver('$_base/update/documents', jsonEncode({
        'previous': {'state': {'desired': prev.toJson(), 'reported': prev.toJson()}, 'version': 1},
        'current': {'state': {'desired': next.toJson(), 'reported': prev.toJson()}, 'version': 2},
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.bedName(1), 'Tomatoes');
      expect(model.bedName(2), 'Flowers');
    });

    test('does NOT re-apply when only reported changed (loop prevention)', () async {
      final model = await connect();
      final cfg = defaultGardenConfig();
      // Seed the model via get/accepted first so we have a known config
      // instance to compare against.
      gateway.deliver('$_base/get/accepted', jsonEncode({
        'state': {'desired': cfg.toJson(), 'reported': cfg.toJson()},
        'version': 1,
      }));
      await Future<void>.delayed(Duration.zero);
      final firstConfig = model.config;
      expect(firstConfig, isNotNull);

      // The Pi's publishReported round-trip looks like this: desired
      // unchanged, reported newly populated. The handler must skip apply.
      gateway.deliver('$_base/update/documents', jsonEncode({
        'previous': {'state': {'desired': cfg.toJson(), 'reported': {}}, 'version': 1},
        'current': {'state': {'desired': cfg.toJson(), 'reported': cfg.toJson()}, 'version': 2},
      }));
      await Future<void>.delayed(Duration.zero);
      expect(identical(model.config, firstConfig), isTrue);
    });

    test('first-ever shadow create (no previous desired) applies', () async {
      final model = await connect();
      final cfg = defaultGardenConfig();
      gateway.deliver('$_base/update/documents', jsonEncode({
        'previous': null,
        'current': {'state': {'desired': cfg.toJson(), 'reported': cfg.toJson()}, 'version': 1},
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNotNull);
    });

    test('invalid desired in documents is logged without changing state', () async {
      final model = await connect();
      gateway.deliver('$_base/update/documents', jsonEncode({
        'previous': {'state': {}},
        'current': {'state': {'desired': {'version': 99, 'beds': {}, 'jobs': [], 'tz': 'UTC'}}, 'version': 1},
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
      expect(
        logModel.messages.any((m) => m.contains('Invalid config from documents')),
        isTrue,
      );
    });

    test('current with no desired is a no-op', () async {
      final model = await connect();
      gateway.deliver('$_base/update/documents', jsonEncode({
        'previous': {'state': {'reported': defaultGardenConfig().toJson()}},
        'current': {'state': {'reported': defaultGardenConfig().toJson()}, 'version': 5},
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
    });

    test('tolerates a missing current.version', () async {
      await connect();
      gateway.deliver('$_base/update/documents', jsonEncode({'current': {}}));
      await Future<void>.delayed(Duration.zero);
      // No throw is the assertion.
    });

    test('ignored when current is not a map', () async {
      await connect();
      gateway.deliver('$_base/update/documents',
          jsonEncode({'current': 'oops'}));
      await Future<void>.delayed(Duration.zero);
      // No throw.
    });
  });

  group('update/accepted + update/rejected', () {
    test('update/accepted is a no-op for apply', () async {
      final model = await connect();
      gateway.deliver('$_base/update/accepted', jsonEncode({
        'state': {'desired': defaultGardenConfig().toJson()},
        'version': 50,
      }));
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
    });

    test('update/rejected logs without throwing', () async {
      await connect();
      gateway.deliver('$_base/update/rejected',
          jsonEncode({'code': 400, 'message': 'bad request'}));
      await Future<void>.delayed(Duration.zero);
      expect(
        logModel.messages.any((m) => m.contains('Config update rejected')),
        isTrue,
      );
    });
  });

  group('renameBed', () {
    test('publishes a desired update with the new name', () async {
      final model = await connect();
      gateway.deliver('$_base/get/accepted', jsonEncode({
        'state': {'desired': defaultGardenConfig().toJson()},
        'version': 1,
      }));
      await Future<void>.delayed(Duration.zero);
      gateway.reset();

      model.renameBed(1, 'New Greenhouse');
      expect(gateway.publishes, hasLength(1));
      expect(gateway.publishes.first.topic, '$_base/update');
      final payload = gateway.publishes.first.payload as Map<String, dynamic>;
      final desired = (payload['state'] as Map)['desired'] as Map;
      expect(((desired['beds'] as Map)['1'] as Map)['name'], 'New Greenhouse');
    });

    test('no-ops if the config has not loaded yet', () async {
      final model = await connect();
      gateway.reset();
      model.renameBed(1, 'Whatever');
      expect(gateway.publishes, isEmpty);
      expect(
        logModel.messages.any((m) => m.contains('config not loaded')),
        isTrue,
      );
    });

    test('rejects empty names', () async {
      final model = await connect();
      gateway.deliver('$_base/get/accepted', jsonEncode({
        'state': {'desired': defaultGardenConfig().toJson()},
        'version': 1,
      }));
      await Future<void>.delayed(Duration.zero);
      gateway.reset();
      model.renameBed(1, '   ');
      expect(gateway.publishes, isEmpty);
      expect(
        logModel.messages.any((m) => m.contains('name is empty')),
        isTrue,
      );
    });
  });

  group('publishConfig', () {
    test('logs and no-ops when disconnected', () async {
      final model = GardenConfigModel(logModel, gateway);
      model.publishConfig(defaultGardenConfig());
      expect(gateway.publishes, isEmpty);
      expect(
        logModel.messages.any((m) => m.contains('MQTT not connected')),
        isTrue,
      );
    });
  });

  group('delivery routing', () {
    test('ignores deliveries on unrelated topics', () async {
      final model = await connect();
      gateway.deliver('something/else', '{"version":99}');
      await Future<void>.delayed(Duration.zero);
      expect(model.config, isNull);
    });

    test('logs malformed JSON without throwing', () async {
      await connect();
      gateway.deliver('$_base/get/accepted', '{not json');
      await Future<void>.delayed(Duration.zero);
      expect(
        logModel.messages.any((m) => m.contains('Failed to decode config shadow')),
        isTrue,
      );
    });
  });

  group('lifecycle', () {
    test('dispose removes the gateway listener', () async {
      final model = await connect();
      model.dispose();
      // Subsequent state changes must not crash and must not re-subscribe.
      gateway.reset();
      gateway.setConnectionState(MqttConnectivity.disconnected);
      gateway.setConnectionState(MqttConnectivity.connected);
      await Future<void>.delayed(const Duration(milliseconds: 600));
      expect(gateway.subscriptions, isEmpty);
      expect(gateway.publishes, isEmpty);
    });

    test('all 4 hardcoded relay ids have a sensible fallback bedName', () {
      final model = GardenConfigModel(logModel, gateway);
      for (final r in AppConfig.relays) {
        expect(model.bedName(r.relayId), 'Bed ${r.relayId}');
      }
    });
  });
}

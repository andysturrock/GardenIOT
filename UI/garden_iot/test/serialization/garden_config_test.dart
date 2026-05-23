import 'dart:convert';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/garden_config.dart';

Map<String, dynamic> _defaultJson() =>
    jsonDecode(jsonEncode(defaultGardenConfig().toJson())) as Map<String, dynamic>;

void main() {
  group('defaultGardenConfig', () {
    test('matches the Pi-side default plan', () {
      final cfg = defaultGardenConfig();
      expect(cfg.version, schemaVersion);
      expect(cfg.tz, 'Europe/London');
      expect(cfg.beds.keys.toList()..sort(), ['1', '2', '3', '4']);
      expect(cfg.beds['1']!.name, 'Greenhouse');
      expect(cfg.beds['2']!.name, 'Flowers');
      expect(cfg.beds['3']!.name, 'Strawberries');
      expect(cfg.beds['4']!.name, 'Sweetcorn');
      expect(cfg.jobs, hasLength(2));

      final veg = cfg.jobs[0];
      expect(veg.id, 'default-morning-veg');
      expect(veg.name, 'Morning veg');
      expect(veg.days, [1, 2, 3, 4, 5, 6, 7]);
      expect(veg.hour, 8);
      expect(veg.minute, 0);
      expect(veg.durationS, 300);
      expect(veg.relays, [1, 2]);

      final fruit = cfg.jobs[1];
      expect(fruit.id, 'default-morning-fruit');
      expect(fruit.minute, 10);
      expect(fruit.relays, [3, 4]);
    });
  });

  group('GardenConfig round-trip', () {
    test('default config encodes and decodes back to itself', () {
      final original = defaultGardenConfig();
      final restored = GardenConfig.fromJson(
        jsonDecode(jsonEncode(original.toJson())),
      );
      expect(restored.version, original.version);
      expect(restored.tz, original.tz);
      expect(restored.beds, original.beds);
      expect(restored.jobs, original.jobs);
    });

    test('omits optional job name when absent', () {
      final raw = _defaultJson();
      (raw['jobs'] as List)[0].remove('name');
      final parsed = GardenConfig.fromJson(raw);
      expect(parsed.jobs[0].name, isNull);
      expect(parsed.jobs[0].toJson().containsKey('name'), isFalse);
    });

    test('dedupes and sorts days', () {
      final raw = _defaultJson();
      (raw['jobs'] as List)[0]['days'] = [3, 1, 7, 1, 5, 3];
      final parsed = GardenConfig.fromJson(raw);
      expect(parsed.jobs[0].days, [1, 3, 5, 7]);
    });

    test('dedupes and sorts relays', () {
      final raw = _defaultJson();
      (raw['jobs'] as List)[0]['relays'] = [4, 1, 2, 1, 3];
      final parsed = GardenConfig.fromJson(raw);
      expect(parsed.jobs[0].relays, [1, 2, 3, 4]);
    });

    test('accepts empty beds and jobs', () {
      final cfg = GardenConfig.fromJson({
        'version': schemaVersion,
        'beds': {},
        'jobs': [],
        'tz': 'UTC',
      });
      expect(cfg.beds, isEmpty);
      expect(cfg.jobs, isEmpty);
      expect(cfg.tz, 'UTC');
    });
  });

  group('GardenConfig rejection', () {
    test('rejects non-object input', () {
      expect(() => GardenConfig.fromJson(null), throwsA(isA<GardenConfigError>()));
      expect(() => GardenConfig.fromJson('nope'), throwsA(isA<GardenConfigError>()));
      expect(() => GardenConfig.fromJson(<int>[]), throwsA(isA<GardenConfigError>()));
    });

    test('rejects unknown schema version', () {
      final raw = _defaultJson()..['version'] = 99;
      expect(
        () => GardenConfig.fromJson(raw),
        throwsA(predicate(
          (e) => e is GardenConfigError && e.message.contains('schema version'),
        )),
      );
    });

    test('rejects missing schema version', () {
      final raw = _defaultJson()..remove('version');
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects when beds is not an object', () {
      final raw = _defaultJson()..['beds'] = [];
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects bed that is not an object', () {
      final raw = _defaultJson();
      (raw['beds'] as Map)['1'] = 'oops';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects bed with non-string name', () {
      final raw = _defaultJson();
      (raw['beds'] as Map)['1'] = {'name': 42};
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects bed with empty name', () {
      final raw = _defaultJson();
      (raw['beds'] as Map)['1'] = {'name': ''};
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects when jobs is not an array', () {
      final raw = _defaultJson()..['jobs'] = {};
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job that is not an object', () {
      final raw = _defaultJson();
      (raw['jobs'] as List)[0] = 'not-a-job';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with missing id', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map).remove('id');
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with empty id', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['id'] = '';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with non-string name', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['name'] = 12;
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with non-array days', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['days'] = 'mon';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with out-of-range day', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['days'] = [0, 1, 2];
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with empty days array', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['days'] = [];
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with out-of-range hour', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['hour'] = 24;
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with non-integer hour', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['hour'] = '08';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with out-of-range minute', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['minute'] = -1;
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with non-positive duration_s', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['duration_s'] = 0;
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with non-integer duration_s', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['duration_s'] = '300';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with non-array relays', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['relays'] = 1;
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with out-of-range relay', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['relays'] = [5];
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects job with empty relays array', () {
      final raw = _defaultJson();
      ((raw['jobs'] as List)[0] as Map)['relays'] = [];
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects when tz is missing', () {
      final raw = _defaultJson()..remove('tz');
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects when tz is empty', () {
      final raw = _defaultJson()..['tz'] = '';
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('rejects when tz is not a string', () {
      final raw = _defaultJson()..['tz'] = 1;
      expect(() => GardenConfig.fromJson(raw), throwsA(isA<GardenConfigError>()));
    });

    test('GardenConfigError.toString includes the message', () {
      final err = GardenConfigError('boom');
      expect(err.toString(), contains('boom'));
    });
  });

  group('copyWith and equality', () {
    test('BedConfig equality and hashCode honour name', () {
      const a = BedConfig(name: 'Greenhouse');
      const b = BedConfig(name: 'Greenhouse');
      const c = BedConfig(name: 'Other');
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });

    test('WateringJobConfig.copyWith overrides chosen fields', () {
      final original = defaultGardenConfig().jobs[0];
      final modified = original.copyWith(name: 'Renamed', hour: 9, relays: [2]);
      expect(modified.name, 'Renamed');
      expect(modified.hour, 9);
      expect(modified.relays, [2]);
      // unchanged fields
      expect(modified.id, original.id);
      expect(modified.minute, original.minute);
      expect(modified.durationS, original.durationS);
      expect(modified.days, original.days);
    });

    test('WateringJobConfig equality covers every field', () {
      final base = defaultGardenConfig().jobs[0];
      expect(base, base.copyWith());
      expect(base, isNot(base.copyWith(id: 'x')));
      expect(base, isNot(base.copyWith(name: 'x')));
      expect(base, isNot(base.copyWith(hour: 9)));
      expect(base, isNot(base.copyWith(minute: 30)));
      expect(base, isNot(base.copyWith(durationS: 999)));
      expect(base, isNot(base.copyWith(days: [1])));
      expect(base, isNot(base.copyWith(relays: [4])));
      expect(base.copyWith().hashCode, base.hashCode);
    });

    test('GardenConfig.copyWith overrides chosen fields', () {
      final original = defaultGardenConfig();
      final modified = original.copyWith(tz: 'UTC');
      expect(modified.tz, 'UTC');
      expect(modified.version, original.version);
      expect(modified.beds, original.beds);
      expect(modified.jobs, original.jobs);
    });

    test('GardenConfig.copyWith with no args preserves all fields', () {
      final original = defaultGardenConfig();
      final copy = original.copyWith();
      expect(copy.tz, original.tz);
      expect(copy.beds, original.beds);
      expect(copy.jobs, original.jobs);
    });
  });

  group('newJobId', () {
    test('produces a string with the job- prefix', () {
      final id = newJobId();
      expect(id, startsWith('job-'));
    });

    test('is deterministic given a seeded Random', () {
      final a = newJobId(Random(42));
      final b = newJobId(Random(42));
      // Timestamp segment may diverge but suffix is seeded; verify the
      // suffix format and that two seeded calls produce identical suffixes.
      expect(a.split('-').last, b.split('-').last);
      expect(a.split('-').last, hasLength(6));
      expect(RegExp(r'^[0-9a-f]{6}$').hasMatch(a.split('-').last), isTrue);
    });

    test('distinct across many calls (sanity)', () {
      final ids = List.generate(50, (_) => newJobId());
      expect(ids.toSet().length, ids.length);
    });
  });
}

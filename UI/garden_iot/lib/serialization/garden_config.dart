import 'dart:math';

/// Shape of the `config` named shadow on the Pi Thing. App and Pi both
/// read and write to this. See docs/garden-config-shadow-plan.md.

const int schemaVersion = 1;

class GardenConfigError implements Exception {
  final String message;
  GardenConfigError(this.message);
  @override
  String toString() => 'GardenConfigError: $message';
}

class BedConfig {
  final String name;
  const BedConfig({required this.name});

  Map<String, dynamic> toJson() => {'name': name};

  factory BedConfig.fromJson(Object? raw, String key) {
    if (raw is! Map) {
      throw GardenConfigError('beds["$key"] is not an object');
    }
    final name = raw['name'];
    if (name is! String || name.isEmpty) {
      throw GardenConfigError('beds["$key"].name must be a non-empty string');
    }
    return BedConfig(name: name);
  }

  @override
  bool operator ==(Object other) => other is BedConfig && other.name == name;

  @override
  int get hashCode => name.hashCode;
}

class WateringJobConfig {
  final String id;
  final String? name;
  final List<int> days; // ISO weekdays 1=Mon..7=Sun
  final int hour; // 0..23
  final int minute; // 0..59
  final int durationS; // > 0
  final List<int> relays; // 1..4

  const WateringJobConfig({
    required this.id,
    this.name,
    required this.days,
    required this.hour,
    required this.minute,
    required this.durationS,
    required this.relays,
  });

  Map<String, dynamic> toJson() {
    final out = <String, dynamic>{
      'id': id,
      'days': List<int>.from(days),
      'hour': hour,
      'minute': minute,
      'duration_s': durationS,
      'relays': List<int>.from(relays),
    };
    if (name != null) out['name'] = name;
    return out;
  }

  WateringJobConfig copyWith({
    String? id,
    String? name,
    List<int>? days,
    int? hour,
    int? minute,
    int? durationS,
    List<int>? relays,
  }) =>
      WateringJobConfig(
        id: id ?? this.id,
        name: name ?? this.name,
        days: days ?? this.days,
        hour: hour ?? this.hour,
        minute: minute ?? this.minute,
        durationS: durationS ?? this.durationS,
        relays: relays ?? this.relays,
      );

  factory WateringJobConfig.fromJson(Object? raw, int index) {
    if (raw is! Map) {
      throw GardenConfigError('jobs[$index] is not an object');
    }

    final id = raw['id'];
    if (id is! String || id.isEmpty) {
      throw GardenConfigError('jobs[$index].id must be a non-empty string');
    }

    String? name;
    if (raw['name'] != null) {
      final n = raw['name'];
      if (n is! String) {
        throw GardenConfigError('jobs[$index].name must be a string if present');
      }
      name = n;
    }

    final rawDays = raw['days'];
    if (rawDays is! List) {
      throw GardenConfigError('jobs[$index].days must be an array');
    }
    final days = _dedupeSorted(rawDays.asMap().entries.map((e) {
      return _intIn(e.value, 1, 7, 'jobs[$index].days[${e.key}]');
    }).toList());
    if (days.isEmpty) {
      throw GardenConfigError('jobs[$index].days must be non-empty');
    }

    final hour = _intIn(raw['hour'], 0, 23, 'jobs[$index].hour');
    final minute = _intIn(raw['minute'], 0, 59, 'jobs[$index].minute');

    final rawDur = raw['duration_s'];
    if (rawDur is! int || rawDur <= 0) {
      throw GardenConfigError('jobs[$index].duration_s must be a positive integer');
    }

    final rawRelays = raw['relays'];
    if (rawRelays is! List) {
      throw GardenConfigError('jobs[$index].relays must be an array');
    }
    final relays = _dedupeSorted(rawRelays.asMap().entries.map((e) {
      return _intIn(e.value, 1, 4, 'jobs[$index].relays[${e.key}]');
    }).toList());
    if (relays.isEmpty) {
      throw GardenConfigError('jobs[$index].relays must be non-empty');
    }

    return WateringJobConfig(
      id: id,
      name: name,
      days: days,
      hour: hour,
      minute: minute,
      durationS: rawDur,
      relays: relays,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is WateringJobConfig &&
      other.id == id &&
      other.name == name &&
      _listEq(other.days, days) &&
      other.hour == hour &&
      other.minute == minute &&
      other.durationS == durationS &&
      _listEq(other.relays, relays);

  @override
  int get hashCode =>
      Object.hash(id, name, Object.hashAll(days), hour, minute, durationS,
          Object.hashAll(relays));
}

class GardenConfig {
  final int version;
  final Map<String, BedConfig> beds;
  final List<WateringJobConfig> jobs;
  final String tz;

  const GardenConfig({
    required this.version,
    required this.beds,
    required this.jobs,
    required this.tz,
  });

  Map<String, dynamic> toJson() => {
        'version': version,
        'beds': beds.map((k, v) => MapEntry(k, v.toJson())),
        'jobs': jobs.map((j) => j.toJson()).toList(),
        'tz': tz,
      };

  factory GardenConfig.fromJson(Object? raw) {
    if (raw is! Map) {
      throw GardenConfigError('GardenConfig must be an object');
    }

    if (raw['version'] != schemaVersion) {
      throw GardenConfigError(
        'unsupported schema version: ${raw['version']} (expected $schemaVersion)',
      );
    }

    final rawBeds = raw['beds'];
    if (rawBeds is! Map) {
      throw GardenConfigError('beds must be an object');
    }
    final beds = <String, BedConfig>{};
    rawBeds.forEach((key, value) {
      beds[key as String] = BedConfig.fromJson(value, key);
    });

    final rawJobs = raw['jobs'];
    if (rawJobs is! List) {
      throw GardenConfigError('jobs must be an array');
    }
    final jobs = <WateringJobConfig>[];
    for (var i = 0; i < rawJobs.length; i++) {
      jobs.add(WateringJobConfig.fromJson(rawJobs[i], i));
    }

    final tz = raw['tz'];
    if (tz is! String || tz.isEmpty) {
      throw GardenConfigError('tz must be a non-empty string');
    }

    return GardenConfig(
      version: schemaVersion,
      beds: beds,
      jobs: jobs,
      tz: tz,
    );
  }

  GardenConfig copyWith({
    Map<String, BedConfig>? beds,
    List<WateringJobConfig>? jobs,
    String? tz,
  }) =>
      GardenConfig(
        version: version,
        beds: beds ?? this.beds,
        jobs: jobs ?? this.jobs,
        tz: tz ?? this.tz,
      );
}

GardenConfig defaultGardenConfig() => const GardenConfig(
      version: schemaVersion,
      beds: {
        '1': BedConfig(name: 'Greenhouse'),
        '2': BedConfig(name: 'Flowers'),
        '3': BedConfig(name: 'Strawberries'),
        '4': BedConfig(name: 'Sweetcorn'),
      },
      jobs: [
        WateringJobConfig(
          id: 'default-morning-veg',
          name: 'Morning veg',
          days: [1, 2, 3, 4, 5, 6, 7],
          hour: 8,
          minute: 0,
          durationS: 600,
          relays: [1, 2],
        ),
        WateringJobConfig(
          id: 'default-morning-fruit',
          name: 'Morning fruit',
          days: [1, 2, 3, 4, 5, 6, 7],
          hour: 8,
          minute: 10,
          durationS: 900,
          relays: [3, 4],
        ),
      ],
      tz: 'Europe/London',
    );

/// Generates a job id stable enough that the same logical job edited
/// twice still has the same id. Format: `job-{base36 millis}-{6 hex}`.
/// `Random.secure()` keeps two concurrent edits from clashing.
String newJobId([Random? rng]) {
  final r = rng ?? Random.secure();
  final ts = DateTime.now().millisecondsSinceEpoch.toRadixString(36);
  final suffix = (r.nextInt(1 << 24)).toRadixString(16).padLeft(6, '0');
  return 'job-$ts-$suffix';
}

int _intIn(Object? value, int min, int max, String path) {
  if (value is! int || value < min || value > max) {
    throw GardenConfigError('$path: expected integer in [$min..$max], got $value');
  }
  return value;
}

List<int> _dedupeSorted(List<int> values) {
  final set = <int>{...values};
  final list = set.toList()..sort();
  return list;
}

bool _listEq(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  for (var i = 0; i < a.length; i++) {
    if (a[i] != b[i]) return false;
  }
  return true;
}

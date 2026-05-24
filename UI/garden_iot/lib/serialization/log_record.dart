import 'dart:convert';

// Shape of a single log message published on the Pi's
// `${CLIENT_ID}/logging` topic and (stage 6) persisted to DynamoDB.
// See docs/garden-config-shadow-plan.md.

enum LogCategory {
  user,
  technical;

  String get wire => name;

  static LogCategory fromWire(Object? raw) {
    if (raw == 'user') return LogCategory.user;
    if (raw == 'technical') return LogCategory.technical;
    throw LogRecordError('category must be "user" or "technical", got $raw');
  }
}

enum LogLevel {
  debug,
  info,
  warn,
  error;

  String get wire => name;

  static LogLevel fromWire(Object? raw) {
    for (final l in LogLevel.values) {
      if (l.wire == raw) return l;
    }
    throw LogRecordError(
      'level must be one of debug|info|warn|error, got $raw',
    );
  }
}

class LogRecordError implements Exception {
  final String message;
  LogRecordError(this.message);
  @override
  String toString() => 'LogRecordError: $message';
}

class LogRecord {
  final String deviceId;
  final int timestamp;
  final LogLevel level;
  final LogCategory category;
  final String message;
  final Map<String, dynamic>? meta;

  const LogRecord({
    required this.deviceId,
    required this.timestamp,
    required this.level,
    required this.category,
    required this.message,
    this.meta,
  });

  Map<String, dynamic> toJson() {
    final out = <String, dynamic>{
      'device_id': deviceId,
      'timestamp': timestamp,
      'level': level.wire,
      'category': category.wire,
      'message': message,
    };
    if (meta != null) out['meta'] = meta;
    return out;
  }

  factory LogRecord.fromJson(Object? raw) {
    if (raw is! Map) {
      throw LogRecordError('LogRecord must be an object');
    }
    final deviceId = raw['device_id'];
    if (deviceId is! String || deviceId.isEmpty) {
      throw LogRecordError('device_id must be a non-empty string');
    }
    final timestamp = raw['timestamp'];
    if (timestamp is! int) {
      throw LogRecordError('timestamp must be an integer');
    }
    final message = raw['message'];
    if (message is! String) {
      throw LogRecordError('message must be a string');
    }
    Map<String, dynamic>? meta;
    if (raw['meta'] != null) {
      final m = raw['meta'];
      if (m is! Map) {
        throw LogRecordError('meta must be an object if present');
      }
      meta = Map<String, dynamic>.from(m);
    }
    return LogRecord(
      deviceId: deviceId,
      timestamp: timestamp,
      level: LogLevel.fromWire(raw['level']),
      category: LogCategory.fromWire(raw['category']),
      message: message,
      meta: meta,
    );
  }

  @override
  bool operator ==(Object other) =>
      other is LogRecord &&
      other.deviceId == deviceId &&
      other.timestamp == timestamp &&
      other.level == level &&
      other.category == category &&
      other.message == message &&
      _metaEq(other.meta, meta);

  @override
  int get hashCode =>
      Object.hash(deviceId, timestamp, level, category, message);
}

bool _metaEq(Map<String, dynamic>? a, Map<String, dynamic>? b) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return jsonEncode(a) == jsonEncode(b);
}

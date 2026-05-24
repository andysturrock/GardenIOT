import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/log_record.dart';

LogRecord _sample({Map<String, dynamic>? meta}) => LogRecord(
      deviceId: 'pi-1',
      timestamp: 1716480000000,
      level: LogLevel.info,
      category: LogCategory.user,
      message: 'Watering "Morning veg" completed',
      meta: meta,
    );

void main() {
  group('LogRecord round-trip', () {
    test('toJson / fromJson preserves all fields including meta', () {
      final r = _sample(meta: {'job_id': 'x', 'relays': [1, 2]});
      final round = LogRecord.fromJson(jsonDecode(jsonEncode(r.toJson())));
      expect(round, r);
    });

    test('toJson omits meta when null', () {
      final r = _sample();
      final json = r.toJson();
      expect(json.containsKey('meta'), isFalse);
    });

    test('fromJson tolerates missing meta', () {
      final json = {
        'device_id': 'pi-1',
        'timestamp': 1,
        'level': 'info',
        'category': 'user',
        'message': 'hi',
      };
      final r = LogRecord.fromJson(json);
      expect(r.meta, isNull);
    });
  });

  group('LogCategory.fromWire', () {
    test('maps user / technical strings', () {
      expect(LogCategory.fromWire('user'), LogCategory.user);
      expect(LogCategory.fromWire('technical'), LogCategory.technical);
    });

    test('rejects unknown category', () {
      expect(() => LogCategory.fromWire('nope'), throwsA(isA<LogRecordError>()));
    });

    test('wire is the enum name', () {
      expect(LogCategory.user.wire, 'user');
      expect(LogCategory.technical.wire, 'technical');
    });
  });

  group('LogLevel.fromWire', () {
    test('maps every level', () {
      for (final l in LogLevel.values) {
        expect(LogLevel.fromWire(l.wire), l);
      }
    });

    test('rejects unknown level', () {
      expect(() => LogLevel.fromWire('fatal'), throwsA(isA<LogRecordError>()));
    });
  });

  group('fromJson validation', () {
    test('rejects non-map input', () {
      expect(() => LogRecord.fromJson('oops'), throwsA(isA<LogRecordError>()));
    });

    test('rejects empty device_id', () {
      expect(
        () => LogRecord.fromJson({
          'device_id': '',
          'timestamp': 1,
          'level': 'info',
          'category': 'user',
          'message': 'hi',
        }),
        throwsA(isA<LogRecordError>()),
      );
    });

    test('rejects non-integer timestamp', () {
      expect(
        () => LogRecord.fromJson({
          'device_id': 'pi',
          'timestamp': '1',
          'level': 'info',
          'category': 'user',
          'message': 'hi',
        }),
        throwsA(isA<LogRecordError>()),
      );
    });

    test('rejects non-string message', () {
      expect(
        () => LogRecord.fromJson({
          'device_id': 'pi',
          'timestamp': 1,
          'level': 'info',
          'category': 'user',
          'message': 123,
        }),
        throwsA(isA<LogRecordError>()),
      );
    });

    test('rejects non-map meta', () {
      expect(
        () => LogRecord.fromJson({
          'device_id': 'pi',
          'timestamp': 1,
          'level': 'info',
          'category': 'user',
          'message': 'hi',
          'meta': 'oops',
        }),
        throwsA(isA<LogRecordError>()),
      );
    });
  });

  group('equality', () {
    test('two records with identical fields and meta compare equal', () {
      final a = _sample(meta: {'k': 1});
      final b = _sample(meta: {'k': 1});
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });

    test('differing meta values are not equal', () {
      expect(_sample(meta: {'k': 1}) == _sample(meta: {'k': 2}), isFalse);
    });

    test('null vs empty meta is not equal', () {
      expect(_sample(meta: {}) == _sample(), isFalse);
    });

    test('LogRecordError.toString includes the message', () {
      expect(LogRecordError('boom').toString(), contains('boom'));
    });
  });
}

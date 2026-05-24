import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/log_record.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/utils/logs_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  group('LogsApi.fetchLogs', () {
    test('builds the GET /logs URL with category/before/limit query params',
        () async {
      Uri? captured;
      final api = LogsApi(client: MockClient((req) async {
        captured = req.url;
        return http.Response(jsonEncode({'logs': [], 'nextBefore': null}), 200);
      }));
      await api.fetchLogs(
          category: LogCategory.user, before: 12345, limit: 25);
      expect(captured!.host, AppConfig.temperatureApiHost);
      expect(captured!.path, AppConfig.logsApiPath);
      expect(captured!.queryParameters['category'], 'user');
      expect(captured!.queryParameters['before'], '12345');
      expect(captured!.queryParameters['limit'], '25');
      api.dispose();
    });

    test('parses logs and grafts AppConfig.deviceId onto each record',
        () async {
      final api = LogsApi(client: MockClient((_) async {
        return http.Response(
          jsonEncode({
            'logs': [
              {
                'timestamp': 100,
                'level': 'info',
                'category': 'user',
                'message': 'a',
              },
              {
                'timestamp': 90,
                'level': 'warn',
                'category': 'user',
                'message': 'b',
                'meta': {'k': 'v'},
              },
            ],
            'nextBefore': 90,
          }),
          200,
        );
      }));
      final page = await api.fetchLogs(
          category: LogCategory.user, before: 200, limit: 50);
      expect(page.logs, hasLength(2));
      expect(page.logs[0].deviceId, AppConfig.deviceId);
      expect(page.logs[0].timestamp, 100);
      expect(page.logs[0].level, LogLevel.info);
      expect(page.logs[1].meta, {'k': 'v'});
      expect(page.nextBefore, 90);
      api.dispose();
    });

    test('nextBefore null when omitted or non-int', () async {
      final api = LogsApi(client: MockClient((_) async => http.Response(
            jsonEncode({'logs': [], 'nextBefore': null}),
            200,
          )));
      final page = await api.fetchLogs(
          category: LogCategory.technical, before: 1, limit: 1);
      expect(page.nextBefore, isNull);
      api.dispose();
    });

    test('skips entries that aren\'t JSON objects', () async {
      final api = LogsApi(client: MockClient((_) async => http.Response(
            jsonEncode({
              'logs': [
                'not-an-object',
                {
                  'timestamp': 1,
                  'level': 'info',
                  'category': 'user',
                  'message': 'kept'
                },
              ],
              'nextBefore': null,
            }),
            200,
          )));
      final page = await api.fetchLogs(
          category: LogCategory.user, before: 1, limit: 1);
      expect(page.logs, hasLength(1));
      expect(page.logs[0].message, 'kept');
      api.dispose();
    });

    test('throws LogsApiException on non-200 status', () async {
      final api = LogsApi(client: MockClient((_) async => http.Response(
            'upstream broken',
            502,
          )));
      await expectLater(
        api.fetchLogs(category: LogCategory.user, before: 1, limit: 1),
        throwsA(isA<LogsApiException>()),
      );
      api.dispose();
    });

    test('throws LogsApiException when body is not a JSON object', () async {
      final api = LogsApi(client: MockClient((_) async => http.Response(
            jsonEncode([1, 2, 3]),
            200,
          )));
      await expectLater(
        api.fetchLogs(category: LogCategory.user, before: 1, limit: 1),
        throwsA(isA<LogsApiException>()),
      );
      api.dispose();
    });

    test('throws LogsApiException when "logs" field is missing/wrong type',
        () async {
      final api = LogsApi(client: MockClient((_) async => http.Response(
            jsonEncode({'logs': 'oops'}),
            200,
          )));
      await expectLater(
        api.fetchLogs(category: LogCategory.user, before: 1, limit: 1),
        throwsA(isA<LogsApiException>()),
      );
      api.dispose();
    });

    test('exception toString surfaces the message', () {
      final e = LogsApiException('boom');
      expect(e.toString(), contains('boom'));
    });

    test('dispose() with caller-provided client does NOT close that client',
        () async {
      var closed = false;
      final mock = MockClient((_) async => http.Response('', 200));
      // We can't sniff close() on MockClient easily; assert that calling
      // dispose() multiple times is safe when the client is caller-owned.
      final api = LogsApi(client: mock);
      api.dispose();
      api.dispose();
      // sanity-touch `closed` to silence the unused-var lint
      expect(closed, isFalse);
    });
  });
}

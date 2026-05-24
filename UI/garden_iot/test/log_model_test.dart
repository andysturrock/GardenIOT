import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/log_record.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/utils/logs_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

import 'fakes/fake_mqtt_gateway.dart';

LogRecord _rec({
  String? deviceId,
  required int ts,
  required LogCategory cat,
  String message = 'm',
  LogLevel level = LogLevel.info,
  Map<String, dynamic>? meta,
}) =>
    LogRecord(
      deviceId: deviceId ?? AppConfig.deviceId,
      timestamp: ts,
      level: level,
      category: cat,
      message: message,
      meta: meta,
    );

LogsApi _apiReturning(LogsPage Function(Uri uri) handler) {
  final mock = MockClient((req) async {
    final page = handler(req.url);
    final body = jsonEncode({
      'logs': [
        for (final r in page.logs)
          {
            'timestamp': r.timestamp,
            'level': r.level.wire,
            'category': r.category.wire,
            'message': r.message,
            if (r.meta != null) 'meta': r.meta,
          },
      ],
      'nextBefore': page.nextBefore,
    });
    return http.Response(body, 200);
  });
  return LogsApi(client: mock);
}

void main() {
  group('LogModel — live ingest', () {
    test('starts empty', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      expect(m.liveUser, isEmpty);
      expect(m.liveTechnical, isEmpty);
      expect(m.historyUser, isEmpty);
      expect(m.historyTechnical, isEmpty);
      m.dispose();
    });

    test('ingestLive partitions by category and stores newest-first', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      m.ingestLive(_rec(ts: 100, cat: LogCategory.user, message: 'u1'));
      m.ingestLive(_rec(ts: 110, cat: LogCategory.technical, message: 't1'));
      m.ingestLive(_rec(ts: 120, cat: LogCategory.user, message: 'u2'));
      expect(m.liveUser.map((r) => r.message).toList(), ['u2', 'u1']);
      expect(m.liveTechnical.map((r) => r.message).toList(), ['t1']);
      m.dispose();
    });

    test('live queue caps at liveCap=200 per category', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      for (var i = 0; i < 250; i++) {
        m.ingestLive(_rec(ts: i, cat: LogCategory.user, message: 'u$i'));
      }
      expect(m.liveUser, hasLength(LogModel.liveCap));
      // Newest is at front; oldest still in the buffer is i=50
      expect(m.liveUser.first.message, 'u249');
      expect(m.liveUser.last.message, 'u50');
      m.dispose();
    });

    test('ingestLive notifies listeners', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      var n = 0;
      m.addListener(() => n++);
      m.ingestLive(_rec(ts: 1, cat: LogCategory.user));
      expect(n, 1);
      m.dispose();
    });
  });

  group('LogModel — legacy log()/messages shim', () {
    test('log(String) appends a technical info record', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      m.log('hello');
      expect(m.liveUser, isEmpty);
      expect(m.liveTechnical, hasLength(1));
      expect(m.liveTechnical.first.message, 'hello');
      expect(m.liveTechnical.first.category, LogCategory.technical);
      expect(m.liveTechnical.first.level, LogLevel.info);
      m.dispose();
    });

    test('messages getter returns oldest-first formatted strings', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      m.log('first');
      m.log('second');
      expect(m.messages, hasLength(2));
      expect(m.messages.first, contains('first'));
      expect(m.messages.last, contains('second'));
      expect(m.messages.first, matches(RegExp(r'^\d{4}-\d{2}-\d{2}')));
    });

    test('messages getter is unmodifiable', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      m.log('one');
      expect(() => m.messages.add('two'), throwsUnsupportedError);
      m.dispose();
    });
  });

  group('LogModel — pagination via loadMore', () {
    test('first loadMore uses before=now and ingests page', () async {
      late Uri capturedUri;
      final m = LogModel(api: _apiReturning((uri) {
        capturedUri = uri;
        return LogsPage(
          logs: [
            _rec(ts: 90, cat: LogCategory.user, message: 'h1'),
            _rec(ts: 80, cat: LogCategory.user, message: 'h2'),
          ],
          nextBefore: 80,
        );
      }));
      await m.loadMore(LogCategory.user);
      expect(m.historyUser.map((r) => r.message), ['h1', 'h2']);
      expect(m.hasMore(LogCategory.user), isTrue);
      // Sanity: before query param must be a positive int (Date.now()-ish)
      final before = int.parse(capturedUri.queryParameters['before']!);
      expect(before, greaterThan(0));
      expect(capturedUri.queryParameters['category'], 'user');
      m.dispose();
    });

    test('subsequent loadMore uses oldest-seen timestamp as before cursor',
        () async {
      final beforeValues = <int>[];
      var call = 0;
      final m = LogModel(api: _apiReturning((uri) {
        beforeValues.add(int.parse(uri.queryParameters['before']!));
        call++;
        if (call == 1) {
          return LogsPage(
            logs: [_rec(ts: 1000, cat: LogCategory.user)],
            nextBefore: 1000,
          );
        }
        return const LogsPage(logs: [], nextBefore: null);
      }));
      await m.loadMore(LogCategory.user);
      await m.loadMore(LogCategory.user);
      // First call: before defaults to now (big number)
      // Second call: before is 1000 (oldest seen)
      expect(beforeValues[1], 1000);
      expect(m.hasMore(LogCategory.user), isFalse);
      m.dispose();
    });

    test('nextBefore=null marks hasMore false', () async {
      final m = LogModel(api: _apiReturning((_) =>
          LogsPage(logs: [_rec(ts: 1, cat: LogCategory.user)], nextBefore: null)));
      expect(m.hasMore(LogCategory.user), isTrue);
      await m.loadMore(LogCategory.user);
      expect(m.hasMore(LogCategory.user), isFalse);
      m.dispose();
    });

    test('does not double-load when called twice concurrently', () async {
      var calls = 0;
      final m = LogModel(api: _apiReturning((_) {
        calls++;
        return const LogsPage(logs: [], nextBefore: null);
      }));
      final a = m.loadMore(LogCategory.user);
      final b = m.loadMore(LogCategory.user);
      await Future.wait([a, b]);
      expect(calls, 1);
      m.dispose();
    });

    test('does nothing once hasMore is false', () async {
      var calls = 0;
      final m = LogModel(api: _apiReturning((_) {
        calls++;
        return const LogsPage(logs: [], nextBefore: null);
      }));
      await m.loadMore(LogCategory.user);
      expect(calls, 1);
      await m.loadMore(LogCategory.user);
      expect(calls, 1);
      m.dispose();
    });

    test('dedupes history items against live tail', () async {
      final m = LogModel(api: _apiReturning((_) => LogsPage(
            logs: [
              _rec(ts: 200, cat: LogCategory.user, message: 'overlap'),
              _rec(ts: 150, cat: LogCategory.user, message: 'older'),
            ],
            nextBefore: 150,
          )));
      // Live already has the overlap entry
      m.ingestLive(_rec(ts: 200, cat: LogCategory.user, message: 'overlap'));
      await m.loadMore(LogCategory.user);
      expect(m.historyUser.map((r) => r.message), ['older']);
      // displayedFor returns live + history with no dupes
      expect(
        m.displayedFor(LogCategory.user).map((r) => r.message),
        ['overlap', 'older'],
      );
      m.dispose();
    });

    test('failed fetch logs an error and marks hasMore=false', () async {
      final mock = MockClient((_) async => http.Response('boom', 500));
      final m = LogModel(api: LogsApi(client: mock));
      await m.loadMore(LogCategory.user);
      expect(m.hasMore(LogCategory.user), isFalse);
      expect(
        m.messages.any((line) => line.contains('Logs fetch failed')),
        isTrue,
      );
      m.dispose();
    });

    test('isLoadingMore flips during the fetch', () async {
      final completer = Completer<void>();
      var pageReturned = false;
      final mock = MockClient((_) async {
        await completer.future;
        pageReturned = true;
        return http.Response(jsonEncode({'logs': [], 'nextBefore': null}), 200);
      });
      final m = LogModel(api: LogsApi(client: mock));
      final fut = m.loadMore(LogCategory.user);
      // Yield once so the async function moves past `_setLoading(true)`.
      await Future<void>.delayed(Duration.zero);
      expect(m.isLoadingMore(LogCategory.user), isTrue);
      expect(pageReturned, isFalse);
      completer.complete();
      await fut;
      expect(m.isLoadingMore(LogCategory.user), isFalse);
      m.dispose();
    });

    test('loadMore routes to the right per-category state', () async {
      final m = LogModel(api: _apiReturning((uri) {
        final cat = uri.queryParameters['category'];
        return LogsPage(
          logs: [
            _rec(
              ts: 1,
              cat: cat == 'user' ? LogCategory.user : LogCategory.technical,
              message: '$cat-only',
            ),
          ],
          nextBefore: null,
        );
      }));
      await m.loadMore(LogCategory.user);
      expect(m.historyUser.map((r) => r.message), ['user-only']);
      expect(m.historyTechnical, isEmpty);
      await m.loadMore(LogCategory.technical);
      expect(m.historyTechnical.map((r) => r.message), ['technical-only']);
      m.dispose();
    });

    test('displayedFor returns live first then history', () async {
      final m = LogModel(api: _apiReturning((_) => LogsPage(
            logs: [_rec(ts: 50, cat: LogCategory.user, message: 'hist')],
            nextBefore: null,
          )));
      m.ingestLive(_rec(ts: 100, cat: LogCategory.user, message: 'live'));
      await m.loadMore(LogCategory.user);
      expect(
        m.displayedFor(LogCategory.user).map((r) => r.message),
        ['live', 'hist'],
      );
      m.dispose();
    });
  });

  group('LogModel — MQTT gateway binding', () {
    test('bindGateway subscribes to the logging topic on connect', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      final gw = FakeMqttGateway();
      m.bindGateway(gw);
      gw.setConnectionState(MqttConnectivity.connected);
      expect(gw.subscriptions, contains(AppConfig.deviceLoggingTopic));
      m.dispose();
      gw.dispose();
    });

    test('bindGateway is a no-op when called twice', () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      final gw = FakeMqttGateway();
      m.bindGateway(gw);
      m.bindGateway(gw);
      gw.setConnectionState(MqttConnectivity.connected);
      // Single subscription, not duplicated.
      expect(
        gw.subscriptions.where((t) => t == AppConfig.deviceLoggingTopic),
        hasLength(1),
      );
      m.dispose();
      gw.dispose();
    });

    test('MQTT delivery on the logging topic is parsed and ingested', () async {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      final gw = FakeMqttGateway();
      m.bindGateway(gw);
      gw.setConnectionState(MqttConnectivity.connected);
      gw.deliver(
        AppConfig.deviceLoggingTopic,
        jsonEncode({
          'device_id': AppConfig.deviceId,
          'timestamp': 12345,
          'level': 'warn',
          'category': 'user',
          'message': 'from mqtt',
        }),
      );
      await Future<void>.delayed(Duration.zero);
      expect(m.liveUser, hasLength(1));
      expect(m.liveUser.first.message, 'from mqtt');
      expect(m.liveUser.first.level, LogLevel.warn);
      m.dispose();
      gw.dispose();
    });

    test('deliveries on other topics are ignored', () async {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      final gw = FakeMqttGateway();
      m.bindGateway(gw);
      gw.setConnectionState(MqttConnectivity.connected);
      gw.deliver('some/other/topic', 'irrelevant');
      await Future<void>.delayed(Duration.zero);
      expect(m.liveUser, isEmpty);
      expect(m.liveTechnical, isEmpty);
      m.dispose();
      gw.dispose();
    });

    test('bad JSON on the logging topic logs a technical error', () async {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      final gw = FakeMqttGateway();
      m.bindGateway(gw);
      gw.setConnectionState(MqttConnectivity.connected);
      gw.deliver(AppConfig.deviceLoggingTopic, 'not json');
      await Future<void>.delayed(Duration.zero);
      expect(
        m.messages.any((line) => line.contains('Failed to decode log record')),
        isTrue,
      );
      m.dispose();
      gw.dispose();
    });

    test('disconnect clears the subscribed flag so reconnect re-subscribes',
        () {
      final m = LogModel(api: _apiReturning((_) => const LogsPage(logs: [], nextBefore: null)));
      final gw = FakeMqttGateway();
      m.bindGateway(gw);
      gw.setConnectionState(MqttConnectivity.connected);
      gw.reset();
      gw.setConnectionState(MqttConnectivity.disconnected);
      gw.setConnectionState(MqttConnectivity.connected);
      expect(gw.subscriptions, contains(AppConfig.deviceLoggingTopic));
      m.dispose();
      gw.dispose();
    });
  });

  group('LogModel — owns LogsApi by default', () {
    test('default ctor creates and disposes its own LogsApi', () {
      final m = LogModel();
      // No way to inspect; just confirm dispose() doesn't throw.
      expect(() => m.dispose(), returnsNormally);
    });
  });
}

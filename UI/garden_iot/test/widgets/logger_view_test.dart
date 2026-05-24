import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/logger.dart';
import 'package:garden_iot/serialization/log_record.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/utils/logs_api.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:provider/provider.dart';

LogRecord _rec({
  required int ts,
  required LogCategory cat,
  String message = 'm',
  LogLevel level = LogLevel.info,
  Map<String, dynamic>? meta,
}) =>
    LogRecord(
      deviceId: AppConfig.deviceId,
      timestamp: ts,
      level: level,
      category: cat,
      message: message,
      meta: meta,
    );

LogsApi _emptyApi() {
  return LogsApi(client: MockClient((_) async => http.Response(
        jsonEncode({'logs': [], 'nextBefore': null}),
        200,
      )));
}

Future<void> _pump(WidgetTester tester, LogModel model) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: ChangeNotifierProvider<LogModel>.value(
          value: model,
          child: const LoggerView(),
        ),
      ),
    ),
  );
}

void main() {
  group('LoggerView — empty + initial load', () {
    testWidgets('shows the empty-state hint when no entries and nothing more',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      expect(find.text('No log messages yet.'), findsOneWidget);
      model.dispose();
    });

    testWidgets('renders the SegmentedButton with User selected by default',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      expect(find.byType(SegmentedButton<LogCategory>), findsOneWidget);
      expect(find.text('User'), findsOneWidget);
      expect(find.text('Technical'), findsOneWidget);
      model.dispose();
    });

    testWidgets('first build kicks off loadMore for the User segment',
        (tester) async {
      var called = 0;
      final api = LogsApi(client: MockClient((req) async {
        called++;
        expect(req.url.queryParameters['category'], 'user');
        return http.Response(
            jsonEncode({'logs': [], 'nextBefore': null}), 200);
      }));
      final model = LogModel(api: api);
      await _pump(tester, model);
      await tester.pumpAndSettle();
      expect(called, 1);
      model.dispose();
    });
  });

  group('LoggerView — live ingest', () {
    testWidgets('ingestLive(user) shows the message in User segment',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      model.ingestLive(_rec(ts: 100, cat: LogCategory.user, message: 'tick'));
      await tester.pumpAndSettle();
      expect(find.text('tick'), findsOneWidget);
      model.dispose();
    });

    testWidgets('User segment does NOT show technical-only messages',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      model.ingestLive(
          _rec(ts: 100, cat: LogCategory.technical, message: 'tech-only'));
      await tester.pumpAndSettle();
      expect(find.text('tech-only'), findsNothing);
      model.dispose();
    });

    testWidgets('renders HH:mm time prefix for User entries',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      final ts = DateTime(2025, 5, 24, 8, 5).millisecondsSinceEpoch;
      model.ingestLive(_rec(ts: ts, cat: LogCategory.user, message: 'tick'));
      await tester.pumpAndSettle();
      expect(find.text('08:05'), findsOneWidget);
      model.dispose();
    });
  });

  group('LoggerView — segment switching', () {
    testWidgets('switching to Technical kicks off a Technical fetch',
        (tester) async {
      final categories = <String>[];
      final api = LogsApi(client: MockClient((req) async {
        categories.add(req.url.queryParameters['category']!);
        return http.Response(
            jsonEncode({'logs': [], 'nextBefore': null}), 200);
      }));
      final model = LogModel(api: api);
      await _pump(tester, model);
      await tester.pumpAndSettle();
      expect(categories, ['user']);

      await tester.tap(find.text('Technical'));
      await tester.pumpAndSettle();
      expect(categories, ['user', 'technical']);
      model.dispose();
    });

    testWidgets('Technical segment renders the level badge', (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      model.ingestLive(
          _rec(ts: 100, cat: LogCategory.technical, message: 'debug-thing', level: LogLevel.error));
      await tester.tap(find.text('Technical'));
      await tester.pumpAndSettle();
      expect(find.text('ERROR'), findsOneWidget);
      expect(find.text('debug-thing'), findsOneWidget);
      model.dispose();
    });

    testWidgets('switching to the same segment does not double-fetch',
        (tester) async {
      var calls = 0;
      final api = LogsApi(client: MockClient((_) async {
        calls++;
        return http.Response(
            jsonEncode({'logs': [], 'nextBefore': null}), 200);
      }));
      final model = LogModel(api: api);
      await _pump(tester, model);
      await tester.pumpAndSettle();
      expect(calls, 1);

      // Tap the already-selected User segment.
      await tester.tap(find.text('User'));
      await tester.pumpAndSettle();
      expect(calls, 1);
      model.dispose();
    });
  });

  group('LoggerView — pagination footer', () {
    testWidgets('shows "No more entries." when hasMore is false',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      model.ingestLive(_rec(ts: 100, cat: LogCategory.user, message: 'only'));
      await tester.pumpAndSettle();
      expect(find.text('No more entries.'), findsOneWidget);
      model.dispose();
    });

    testWidgets('shows a spinner while loading', (tester) async {
      final block = Completer<http.Response>();
      final api = LogsApi(client: MockClient((_) => block.future));
      final model = LogModel(api: api);
      await _pump(tester, model);
      // Pump once so the loadMore kicks off but the response is still pending.
      await tester.pump();
      await tester.pump();
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      block.complete(
          http.Response(jsonEncode({'logs': [], 'nextBefore': null}), 200));
      await tester.pumpAndSettle();
      model.dispose();
    });
  });

  group('LoggerView — technical meta expansion', () {
    testWidgets('tapping a tile with meta toggles a JSON preview',
        (tester) async {
      final model = LogModel(api: _emptyApi());
      await _pump(tester, model);
      await tester.pumpAndSettle();
      model.ingestLive(_rec(
        ts: 100,
        cat: LogCategory.technical,
        message: 'evt',
        meta: {'job_id': 'abc', 'count': 3},
      ));
      await tester.tap(find.text('Technical'));
      await tester.pumpAndSettle();
      // Collapsed: meta JSON not visible
      expect(find.textContaining('job_id'), findsNothing);
      // Tap the tile (find by message text)
      await tester.tap(find.text('evt'));
      await tester.pumpAndSettle();
      expect(find.textContaining('job_id'), findsOneWidget);
      model.dispose();
    });
  });

  group('LoggerView — pagination via scroll', () {
    testWidgets('scrolling near the bottom triggers another loadMore',
        (tester) async {
      // First call returns 30 entries + nextBefore=non-null so hasMore stays true.
      // Subsequent calls (one per scroll-into-threshold) return empty + null.
      var call = 0;
      final api = LogsApi(client: MockClient((_) async {
        call++;
        if (call == 1) {
          return http.Response(
            jsonEncode({
              'logs': [
                for (var i = 0; i < 30; i++)
                  {
                    'timestamp': 1000 - i,
                    'level': 'info',
                    'category': 'user',
                    'message': 'row-$i',
                  },
              ],
              'nextBefore': 970,
            }),
            200,
          );
        }
        return http.Response(
            jsonEncode({'logs': [], 'nextBefore': null}), 200);
      }));
      final model = LogModel(api: api);
      await _pump(tester, model);
      await tester.pumpAndSettle();
      expect(call, 1);

      // Drag the list up enough that we land in the load-more zone.
      await tester.drag(find.byType(ListView), const Offset(0, -2000));
      await tester.pumpAndSettle();
      expect(call, 2);
      model.dispose();
    });
  });
}

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/logger.dart';
import 'package:provider/provider.dart';

Future<void> pumpLogger(WidgetTester tester, LogModel model) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: Provider<LogModel>.value(
          value: model,
          child: const LoggerView(),
        ),
      ),
    ),
  );
}

void main() {
  late LogModel model;

  setUp(() {
    model = LogModel();
  });

  tearDown(() {
    model.dispose();
  });

  group('LoggerView', () {
    testWidgets('shows the empty-state hint when there are no log messages', (tester) async {
      await pumpLogger(tester, model);
      expect(find.text('No log messages yet.'), findsOneWidget);
      expect(find.byType(ListView), findsNothing);
    });

    testWidgets('renders each log line as the buffer fills via the stream', (tester) async {
      await pumpLogger(tester, model);
      model.log('first event');
      model.log('second event');
      // Let the stream + animations settle
      await tester.pumpAndSettle();
      expect(find.textContaining('first event'), findsOneWidget);
      expect(find.textContaining('second event'), findsOneWidget);
    });

    testWidgets('hides the empty-state hint after a message arrives', (tester) async {
      await pumpLogger(tester, model);
      model.log('appeared');
      await tester.pumpAndSettle();
      expect(find.text('No log messages yet.'), findsNothing);
    });

    testWidgets('switches to ListView when messages exist', (tester) async {
      await pumpLogger(tester, model);
      model.log('one');
      await tester.pumpAndSettle();
      expect(find.byType(ListView), findsOneWidget);
    });
  });
}

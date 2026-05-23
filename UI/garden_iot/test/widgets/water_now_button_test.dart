import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/water_now_button.dart';

const _relay = RelayConfig(relayId: 1);

/// Pumps a single WaterNowButton inside a MaterialApp + Scaffold.
Future<void> pumpButton(
  WidgetTester tester, {
  String name = 'Greenhouse',
  RelayState? reportedState,
  bool enabled = true,
  ValueChanged<bool>? onToggle,
  VoidCallback? onLongPress,
}) {
  return tester.pumpWidget(
    MaterialApp(
      home: Scaffold(
        body: WaterNowButton(
          relay: _relay,
          name: name,
          reportedState: reportedState,
          enabled: enabled,
          onToggle: onToggle ?? (_) {},
          onLongPress: onLongPress,
        ),
      ),
    ),
  );
}

void main() {
  group('WaterNowButton', () {
    testWidgets('renders the name passed in', (tester) async {
      await pumpButton(tester, name: 'Tomatoes');
      expect(find.text('Tomatoes'), findsOneWidget);
    });

    testWidgets('shows "Watering" when the reported state is open',
        (tester) async {
      await pumpButton(tester, reportedState: RelayState.open);
      expect(find.text('Watering'), findsOneWidget);
    });

    testWidgets('shows "Off" when the reported state is closed',
        (tester) async {
      await pumpButton(tester, reportedState: RelayState.closed);
      expect(find.text('Off'), findsOneWidget);
    });

    testWidgets('shows "Unknown" when no reported state has arrived',
        (tester) async {
      await pumpButton(tester, reportedState: null);
      expect(find.text('Unknown'), findsOneWidget);
    });

    testWidgets('Switch reflects the reported state', (tester) async {
      await pumpButton(tester, reportedState: RelayState.open);
      final switchWidget = tester.widget<Switch>(find.byType(Switch));
      expect(switchWidget.value, isTrue);
    });

    testWidgets('Switch is disabled when enabled=false', (tester) async {
      await pumpButton(tester, enabled: false, reportedState: RelayState.closed);
      final switchWidget = tester.widget<Switch>(find.byType(Switch));
      expect(switchWidget.onChanged, isNull);
    });

    testWidgets(
        'tapping the switch calls onToggle with the inverse of current state',
        (tester) async {
      bool? captured;
      await pumpButton(
        tester,
        reportedState: RelayState.closed,
        onToggle: (v) => captured = v,
      );
      await tester.tap(find.byType(Switch));
      await tester.pump();
      expect(captured, isTrue);
    });

    testWidgets('tapping the card body also triggers onToggle (InkWell)',
        (tester) async {
      bool? captured;
      await pumpButton(
        tester,
        reportedState: RelayState.open,
        onToggle: (v) => captured = v,
      );
      // Tap on the card text rather than the switch
      await tester.tap(find.text('Greenhouse'));
      await tester.pump();
      expect(captured, isFalse);
    });

    testWidgets('tapping when disabled does NOT call onToggle',
        (tester) async {
      var called = false;
      await pumpButton(
        tester,
        enabled: false,
        reportedState: RelayState.closed,
        onToggle: (_) => called = true,
      );
      await tester.tap(find.text('Greenhouse'));
      await tester.pump();
      expect(called, isFalse);
    });

    testWidgets('long-press triggers onLongPress when provided',
        (tester) async {
      var pressed = false;
      await pumpButton(
        tester,
        reportedState: RelayState.closed,
        onLongPress: () => pressed = true,
      );
      await tester.longPress(find.text('Greenhouse'));
      await tester.pump();
      expect(pressed, isTrue);
    });

    testWidgets('long-press does nothing when onLongPress is null',
        (tester) async {
      await pumpButton(tester, reportedState: RelayState.closed);
      await tester.longPress(find.text('Greenhouse'));
      await tester.pump();
      // No throw; nothing to assert.
    });

    testWidgets('renders the icon for each IconCodepoint', (tester) async {
      for (final ic in IconCodepoint.values) {
        await tester.pumpWidget(MaterialApp(
          home: Scaffold(
            body: WaterNowButton(
              relay: RelayConfig(relayId: 1, icon: ic),
              name: 'X',
              reportedState: null,
              enabled: true,
              onToggle: (_) {},
            ),
          ),
        ));
        expect(find.byType(Icon), findsWidgets);
      }
    });
  });
}

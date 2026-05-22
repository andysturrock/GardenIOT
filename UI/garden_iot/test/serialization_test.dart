import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/shadow_message.dart';

void main() {
  group('RelayState', () {
    test('fromJsonString parses "open" / "closed" / unknown', () {
      expect(RelayState.fromJsonString('open'), RelayState.open);
      expect(RelayState.fromJsonString('closed'), RelayState.closed);
      expect(RelayState.fromJsonString('something_else'), isNull);
      expect(RelayState.fromJsonString(null), isNull);
    });

    test('isOpen reflects state', () {
      expect(RelayState.open.isOpen, isTrue);
      expect(RelayState.closed.isOpen, isFalse);
    });
  });

  group('ShadowMessage.fromJson', () {
    test('parses reported-only payload', () {
      final json = jsonDecode('{"state":{"reported":{"open_closed":"open"}}}');
      final msg = ShadowMessage.fromJson(json);
      expect(msg.reported, RelayState.open);
      expect(msg.desired, isNull);
    });

    test('parses desired-only payload', () {
      final json = jsonDecode('{"state":{"desired":{"open_closed":"closed"}}}');
      final msg = ShadowMessage.fromJson(json);
      expect(msg.desired, RelayState.closed);
      expect(msg.reported, isNull);
    });

    test('parses combined reported + desired', () {
      final json = jsonDecode(
        '{"state":{"reported":{"open_closed":"closed"},"desired":{"open_closed":"open"}}}',
      );
      final msg = ShadowMessage.fromJson(json);
      expect(msg.reported, RelayState.closed);
      expect(msg.desired, RelayState.open);
    });

    test('handles missing state', () {
      final msg = ShadowMessage.fromJson(<String, dynamic>{});
      expect(msg.reported, isNull);
      expect(msg.desired, isNull);
    });
  });

  test('desiredUpdate builds the expected envelope', () {
    expect(
      ShadowMessage.desiredUpdate(RelayState.open),
      {
        'state': {
          'desired': {'open_closed': 'open'},
        },
      },
    );
  });

  group('ShadowMessage equality + hashing', () {
    test('two messages with identical fields are equal and share a hashCode', () {
      const a = ShadowMessage(reported: RelayState.open, desired: RelayState.closed);
      const b = ShadowMessage(reported: RelayState.open, desired: RelayState.closed);
      expect(a, equals(b));
      expect(a.hashCode, b.hashCode);
    });

    test('messages differing in reported are not equal', () {
      const a = ShadowMessage(reported: RelayState.open, desired: RelayState.closed);
      const b = ShadowMessage(reported: RelayState.closed, desired: RelayState.closed);
      expect(a, isNot(equals(b)));
    });

    test('messages differing in desired are not equal', () {
      const a = ShadowMessage(reported: RelayState.open, desired: RelayState.open);
      const b = ShadowMessage(reported: RelayState.open, desired: RelayState.closed);
      expect(a, isNot(equals(b)));
    });

    test('a ShadowMessage is not equal to a non-ShadowMessage', () {
      const a = ShadowMessage(reported: RelayState.open);
      // ignore: unrelated_type_equality_checks
      expect(a == 42, isFalse);
    });

    test('toJsonString round-trips for both enum values', () {
      expect(RelayState.fromJsonString(RelayState.open.toJsonString()), RelayState.open);
      expect(RelayState.fromJsonString(RelayState.closed.toJsonString()), RelayState.closed);
    });
  });
}

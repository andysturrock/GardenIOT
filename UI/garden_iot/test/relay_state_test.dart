import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/relay_state.dart';

void main() {
  test('OpenClosed deserialises correctly', () {
    final expected = OpenClosed("open");

    String json = jsonEncode(expected);
    var actualMap = jsonDecode(json);

    final actual = OpenClosed.fromJson(actualMap);

    expect(actual, expected);
  });

  test('Reported deserialises correctly', () {
    final expectedOpenClosed = OpenClosed("open");
    final expected = Reported(expectedOpenClosed);

    String json = jsonEncode(expected);
    var actualMap = jsonDecode(json);

    final actual = Reported.fromJson(actualMap);

    expect(actual, expected);
  });

  test('ReportedState deserialises correctly', () {
    final expectedOpenClosed = OpenClosed("open");
    final expectedReported = Reported(expectedOpenClosed);
    final expected = ReportedState(expectedReported);

    String json = jsonEncode(expected);
    var actualMap = jsonDecode(json);

    final actual = ReportedState.fromJson(actualMap);

    expect(actual, expected);
  });

  test('Desired deserialises correctly', () {
    final expectedOpenClosed = OpenClosed("open");
    final expected = Desired(expectedOpenClosed);

    String json = jsonEncode(expected);
    var actualMap = jsonDecode(json);

    final actual = Desired.fromJson(actualMap);

    expect(actual, expected);
  });

  test('DesiredState deserialises correctly', () {
    final expectedOpenClosed = OpenClosed("open");
    final expectedReported = Desired(expectedOpenClosed);
    final expected = DesiredState(expectedReported);

    String json = jsonEncode(expected);
    var actualMap = jsonDecode(json);

    final actual = DesiredState.fromJson(actualMap);

    expect(actual, expected);
  });
}

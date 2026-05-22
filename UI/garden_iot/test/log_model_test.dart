import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';

void main() {
  late LogModel model;

  setUp(() {
    model = LogModel();
  });

  tearDown(() {
    model.dispose();
  });

  group('LogModel', () {
    test('starts with an empty message list', () {
      expect(model.messages, isEmpty);
    });

    test('log() appends a timestamped message to the buffer', () {
      model.log('hello');
      expect(model.messages, hasLength(1));
      expect(model.messages.first, contains('hello'));
      // ISO-8601-ish timestamp prefix produced by DateTime.now().toString()
      expect(model.messages.first, matches(RegExp(r'^\d{4}-\d{2}-\d{2}')));
    });

    test('log() emits to the broadcast stream with the updated buffer', () async {
      final emissions = <List<String>>[];
      final sub = model.stream.listen(emissions.add);
      model.log('first');
      model.log('second');
      // Let the stream drain
      await Future<void>.delayed(Duration.zero);

      expect(emissions, hasLength(2));
      expect(emissions[0], hasLength(1));
      expect(emissions[1], hasLength(2));
      await sub.cancel();
    });

    test('buffer is capped at 50 entries (oldest dropped)', () {
      for (var i = 0; i < 60; i++) {
        model.log('msg-$i');
      }
      expect(model.messages, hasLength(50));
      // The first 10 should be gone; we keep msg-10 through msg-59.
      expect(model.messages.first, contains('msg-10'));
      expect(model.messages.last, contains('msg-59'));
    });

    test('messages getter returns an unmodifiable view', () {
      model.log('one');
      expect(() => model.messages.add('two'), throwsUnsupportedError);
    });

    test('stream is broadcast (supports multiple listeners)', () async {
      final a = <List<String>>[];
      final b = <List<String>>[];
      final subA = model.stream.listen(a.add);
      final subB = model.stream.listen(b.add);
      model.log('shared');
      await Future<void>.delayed(Duration.zero);

      expect(a, hasLength(1));
      expect(b, hasLength(1));
      await subA.cancel();
      await subB.cancel();
    });

    test('dispose() closes the stream', () async {
      final m = LogModel();
      // Listen with cancelOnError so onDone fires on close.
      var done = false;
      final sub = m.stream.listen((_) {}, onDone: () => done = true);
      m.dispose();
      await Future<void>.delayed(Duration.zero);
      expect(done, isTrue);
      await sub.cancel();
    });
  });
}

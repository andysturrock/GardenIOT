import 'dart:async';
import 'dart:collection';

class LogModel {
  static const int _capacity = 50;

  final Queue<String> _buffer = Queue<String>();
  final StreamController<List<String>> _controller =
      StreamController<List<String>>.broadcast();

  List<String> get messages => List.unmodifiable(_buffer);

  Stream<List<String>> get stream => _controller.stream;

  void log(String message) {
    final timed = '${DateTime.now()} - $message';
    _buffer.addLast(timed);
    while (_buffer.length > _capacity) {
      _buffer.removeFirst();
    }
    _controller.add(messages);
  }

  void dispose() {
    _controller.close();
  }
}

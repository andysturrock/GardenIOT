import 'package:mutex/mutex.dart';

abstract class LogListener {
  void onLogMessage(String logMessage);
}

class LogModel {
  List<LogListener> _logListeners = [];
  final _mutex = Mutex();
  List<String> _logMessages = [];
  final _logMessageLimit = 50;

  LogModel() {
    print('Constructing the one and only LogModel');
  }

  /// Register a listener which will be called when there is a new log message.
  Future<void> addLogListener(LogListener listener) async {
    await _mutex.acquire();
    _logListeners.add(listener);
  }

  /// Remove this listener.  Returns true if this listener was registered.
  Future<bool> removeLogListener(LogListener listener) async {
    await _mutex.acquire();
    return _logListeners.remove(listener);
  }

  /// log a message which will be sent to all subscribers.
  Future<void> log(String logMessage) async {
    final now = DateTime.now();
    final timedLogMessage = '$now - $logMessage';
    print(timedLogMessage); // For debugging
    if (_logMessages.length > _logMessageLimit) {
      _logMessages.removeAt(0);
    }
    _logMessages.add(timedLogMessage);
    await _mutex.acquire();
    await _updateListeners(logMessage);
  }

  /// Get all existing log messages
  List<String> getLogMessages() {
    return _logMessages;
  }

  Future<void> _updateListeners(String logMessage) async {
    await _mutex.acquire();
    _logListeners.forEach((listener) {
      listener.onLogMessage(logMessage);
    });
  }
}

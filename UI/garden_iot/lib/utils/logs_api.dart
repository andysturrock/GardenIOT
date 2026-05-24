import 'dart:convert';

import 'package:garden_iot/serialization/log_record.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:http/http.dart' as http;

class LogsPage {
  final List<LogRecord> logs;
  final int? nextBefore;
  const LogsPage({required this.logs, required this.nextBefore});
}

class LogsApiException implements Exception {
  final String message;
  LogsApiException(this.message);
  @override
  String toString() => 'LogsApiException: $message';
}

class LogsApi {
  final http.Client _client;
  final bool _ownsClient;

  LogsApi({http.Client? client})
      : _client = client ?? http.Client(),
        _ownsClient = client == null;

  Future<LogsPage> fetchLogs({
    required LogCategory category,
    required int before,
    int limit = 50,
  }) async {
    final uri = Uri.https(
      AppConfig.temperatureApiHost,
      AppConfig.logsApiPath,
      {
        'category': category.wire,
        'before': '$before',
        'limit': '$limit',
      },
    );
    final response = await _client.get(uri);
    if (response.statusCode != 200) {
      throw LogsApiException(
        'GET /logs failed: HTTP ${response.statusCode}',
      );
    }
    final decoded = jsonDecode(response.body);
    if (decoded is! Map) {
      throw LogsApiException('GET /logs returned non-object body');
    }
    final rawLogs = decoded['logs'];
    if (rawLogs is! List) {
      throw LogsApiException('GET /logs body missing "logs" list');
    }
    // The Lambda omits device_id (single-Pi deployment, scoped via env);
    // graft it back so LogRecord.fromJson can validate.
    final logs = <LogRecord>[];
    for (final raw in rawLogs) {
      if (raw is! Map) continue;
      final withDevice = <String, dynamic>{
        ...Map<String, dynamic>.from(raw),
        'device_id': AppConfig.deviceId,
      };
      logs.add(LogRecord.fromJson(withDevice));
    }
    final nextBefore = decoded['nextBefore'];
    return LogsPage(
      logs: logs,
      nextBefore: nextBefore is int ? nextBefore : null,
    );
  }

  void dispose() {
    if (_ownsClient) _client.close();
  }
}

import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:http/http.dart' as http;

class TemperatureReading {
  final int sensorId;
  final double temperature;

  const TemperatureReading(this.sensorId, this.temperature);

  factory TemperatureReading.fromJson(Map<String, dynamic> json) {
    final raw = json['temperature'];
    final temperature = raw is num ? raw.toDouble() : double.parse('$raw');
    final id = json['sensor_id'];
    final sensorId = id is int ? id : int.parse('$id');
    return TemperatureReading(sensorId, temperature);
  }

  @override
  String toString() => 'TemperatureReading($sensorId, $temperature)';
}

class TemperatureModel with ChangeNotifier {
  final Duration _pollPeriod;
  final LogModel _logModel;
  final List<int> _sensorIds;
  final http.Client _httpClient;

  Map<int, TemperatureReading> _readings = <int, TemperatureReading>{};
  Timer? _timer;
  bool _disposed = false;

  /// [httpClient] can be injected for tests; defaults to a fresh
  /// `http.Client()` for production.
  TemperatureModel(
    this._pollPeriod,
    this._logModel, {
    http.Client? httpClient,
  })  : _sensorIds = AppConfig.sensors.map((s) => s.sensorId).toList(growable: false),
        _httpClient = httpClient ?? http.Client() {
    if (_sensorIds.isEmpty) return;
    unawaited(_poll());
    _timer = Timer.periodic(_pollPeriod, (_) => _poll());
  }

  TemperatureReading? readingFor(int sensorId) => _readings[sensorId];

  Future<void> _poll() async {
    if (_disposed) return;
    try {
      // The lambda parses sensor IDs from the *keys* of queryStringParameters,
      // stripping the literal "sensor_id" prefix. So we emit
      // `?sensor_id1=&sensor_id2=` (values are ignored).
      final uri = Uri.https(
        AppConfig.temperatureApiHost,
        AppConfig.temperatureApiPath,
        {for (final id in _sensorIds) 'sensor_id$id': ''},
      );
      final response = await _httpClient.get(uri);
      if (_disposed) return;
      if (response.statusCode != 200) {
        _logModel.log('Temperature fetch failed: HTTP ${response.statusCode}');
        return;
      }
      final decoded = jsonDecode(response.body) as List<dynamic>;
      final next = <int, TemperatureReading>{};
      for (final item in decoded) {
        final reading = TemperatureReading.fromJson(item as Map<String, dynamic>);
        next[reading.sensorId] = reading;
      }
      _readings = next;
      notifyListeners();
    } catch (e) {
      _logModel.log('Temperature fetch error: $e');
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _timer?.cancel();
    _httpClient.close();
    super.dispose();
  }
}

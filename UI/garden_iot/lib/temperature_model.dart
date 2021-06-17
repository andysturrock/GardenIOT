import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;

class TemperatureReading {
  final int sensor_id;
  final double temperature;

  TemperatureReading(this.sensor_id, this.temperature);

  TemperatureReading.fromJson(Map<String, dynamic> json)
      : sensor_id = json['sensor_id'],
        temperature = double.parse(json['temperature']);

  @override
  String toString() {
    return '"sensor_id": ${sensor_id}, "temperature": ${temperature}';
  }
}

class SensorIdToTemperatureReading {
  final Map<int, TemperatureReading> _temperatureResults =
      new Map<int, TemperatureReading>();

  SensorIdToTemperatureReading() {}

  TemperatureReading? operator [](int sensorId) =>
      _temperatureResults[sensorId];

  SensorIdToTemperatureReading.fromJson(List<dynamic> json) {
    for (final temperatureResultJson in json) {
      var temperatureResult =
          TemperatureReading.fromJson(temperatureResultJson);
      _temperatureResults[temperatureResult.sensor_id] = temperatureResult;
    }
  }

  @override
  String toString() {
    var stringBuffer = new StringBuffer('[');
    _temperatureResults.forEach((key, value) {
      stringBuffer.write('{${value}},');
    });
    stringBuffer.write(']');
    return stringBuffer.toString();
  }
}

class TemperatureModel with ChangeNotifier {
  final Duration _pollPeriod;
  SensorIdToTemperatureReading _currentTemperatures =
      new SensorIdToTemperatureReading();
  final List<int> _sensorIds = [];

  TemperatureModel(this._pollPeriod) {
    new Timer.periodic(_pollPeriod, (_) => _getTemperature());
  }

  void addSensor(int sensorId) => this._sensorIds.add(sensorId);

  void removeSensor(int sensorId) => this._sensorIds.remove(sensorId);

  SensorIdToTemperatureReading get currentTemperatures => _currentTemperatures;

  TemperatureReading? getCurrentTemperature(int sensorId) =>
      _currentTemperatures[sensorId];

  void _getTemperature() async {
    var uri = 'https://api.gardeniot.dev.goatsinlace.com/0_0_1/temperature?';
    for (var sensor_id in this._sensorIds) {
      uri += "sensor_id${sensor_id.toString()}&";
    }
    final response = await http.get(Uri.parse(uri));

    if (response.statusCode == 200) {
      _currentTemperatures =
          SensorIdToTemperatureReading.fromJson(jsonDecode(response.body));
      notifyListeners();
    } else {
      print("Failed to load temperature:\n ${response}");
      throw Exception('Failed to load temperature');
    }
  }
}

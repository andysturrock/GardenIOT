import 'package:flutter/material.dart';
import 'dart:async';
import 'package:syncfusion_flutter_gauges/gauges.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';

class TemperatureDial extends StatefulWidget {
  final String location;
  final int pollPeriod = 5;

  TemperatureDial({Key? key, required this.location}) : super(key: key);

  @override
  _TemperatureDialState createState() => _TemperatureDialState();
}

class _TemperatureDialState extends State<TemperatureDial> {
  @override
  void initState() {
    super.initState();
    var period = Duration(seconds: widget.pollPeriod);
    new Timer.periodic(period, (Timer t) => getTemperature());
  }

  double _temperature = 0;

  @override
  Widget build(BuildContext context) {
    return SfRadialGauge(
        title: GaugeTitle(
            text: widget.location,
            textStyle:
                const TextStyle(fontSize: 20.0, fontWeight: FontWeight.bold)),
        axes: <RadialAxis>[
          RadialAxis(minimum: -10, maximum: 50, ranges: <GaugeRange>[
            GaugeRange(
                startValue: -10,
                endValue: 2,
                color: Colors.red,
                startWidth: 10,
                endWidth: 10),
            GaugeRange(
                startValue: 2,
                endValue: 10,
                color: Colors.amber,
                startWidth: 10,
                endWidth: 10),
            GaugeRange(
                startValue: 5,
                endValue: 25,
                color: Colors.green,
                startWidth: 10,
                endWidth: 10),
            GaugeRange(
                startValue: 25,
                endValue: 35,
                color: Colors.amber,
                startWidth: 10,
                endWidth: 10),
            GaugeRange(
                startValue: 35,
                endValue: 50,
                color: Colors.red,
                startWidth: 10,
                endWidth: 10),
          ], pointers: <GaugePointer>[
            NeedlePointer(value: _temperature)
          ], annotations: <GaugeAnnotation>[
            GaugeAnnotation(
                widget: Container(
                    child: Text(_temperature.toString(),
                        style: TextStyle(
                            fontSize: 25, fontWeight: FontWeight.bold))),
                angle: 90,
                positionFactor: 0.5)
          ])
        ]);
  }

  void getTemperature() async {
    print("In getTemp for ${widget.location}");

    final response = await http.get(Uri.parse(
        'https://api.gardeniot.dev.goatsinlace.com/0_0_1/temperature?name1=value1'));

    if (response.statusCode == 200) {
      final temperatureResultList =
          TemperatureResultList.fromJson(jsonDecode(response.body));
      print("Result = ${temperatureResultList}");
      if (temperatureResultList.temperatureResults.length != 1) {
        throw Exception(
            'Expected 1 temperature result, got ${temperatureResultList.temperatureResults.length}');
      }
      setState(() {
        _temperature = temperatureResultList.temperatureResults[0].temperature;
      });
    } else {
      throw Exception('Failed to load temperature');
    }
  }
}

class TemperatureResult {
  final int sensor_id;
  final double temperature;

  TemperatureResult(this.sensor_id, this.temperature);

  TemperatureResult.fromJson(Map<String, dynamic> json)
      : sensor_id = json['sensor_id'],
        temperature = double.parse(json['temperature']);
}

class TemperatureResultList {
  final List<TemperatureResult> temperatureResults = [];

  TemperatureResultList.fromJson(List<dynamic> json) {
    for (final temperatureResult in json) {
      temperatureResults.add(TemperatureResult.fromJson(temperatureResult));
    }
  }
}

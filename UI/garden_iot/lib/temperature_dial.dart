import 'package:flutter/material.dart';
import 'package:syncfusion_flutter_gauges/gauges.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';

class TemperatureDial extends StatefulWidget {
  final String dialName;
  final int sensorId;
  final TemperatureModel temperatureModel;

  TemperatureDial({
    required this.temperatureModel,
    required this.dialName,
    required this.sensorId,
  }) {}

  @override
  _TemperatureDialState createState() => _TemperatureDialState();
}

class _TemperatureDialState extends State<TemperatureDial> {
  @override
  void initState() {
    super.initState();
    widget.temperatureModel.addSensor(widget.sensorId);
  }

  @override
  void dispose() {
    widget.temperatureModel.removeSensor(widget.sensorId);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final temperatureReading = context
        .watch<TemperatureModel>()
        .getCurrentTemperature(widget.sensorId);
    final temperature =
        (temperatureReading == null) ? 0.00 : temperatureReading.temperature;
    print("build: temperature = ${temperature}");
    return SfRadialGauge(
        title: GaugeTitle(
            text: widget.dialName,
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
            NeedlePointer(value: temperature)
          ], annotations: <GaugeAnnotation>[
            GaugeAnnotation(
                widget: Container(
                    child: Text(temperature.toString(),
                        style: TextStyle(
                            fontSize: 12, fontWeight: FontWeight.bold))),
                angle: 90,
                positionFactor: 0.5)
          ])
        ]);
  }
}

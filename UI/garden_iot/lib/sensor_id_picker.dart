import 'package:flutter/material.dart';
import 'package:numberpicker/numberpicker.dart';

class SensorIdPicker extends StatefulWidget {
  final int minValue;
  final int maxValue;
  final int initialValue;
  final ValueChanged<int>? onChanged;

  SensorIdPicker(
      {required this.minValue,
      required this.maxValue,
      required this.initialValue,
      this.onChanged}) {}

  @override
  _SensorIdPickerState createState() => _SensorIdPickerState(initialValue);
}

class _SensorIdPickerState extends State<SensorIdPicker> {
  int _currentValue;

  _SensorIdPickerState(int startValue) : _currentValue = startValue {}

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Text(
          "Sensor ID",
          textAlign: TextAlign.left,
        ),
        NumberPicker(
          value: _currentValue,
          axis: Axis.horizontal,
          minValue: widget.minValue,
          maxValue: widget.maxValue,
          onChanged: (newValue) {
            setState(() => _currentValue = newValue);
            widget.onChanged?.call(newValue);
          },
        ),
      ],
    );
  }
}

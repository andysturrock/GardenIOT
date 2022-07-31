import 'package:flutter/material.dart';

enum DialType { temperature, moisture }

class DialTypeDropdown extends StatefulWidget {
  final DialType initialValue;
  final ValueChanged<DialType>? onChanged;

  DialTypeDropdown({required this.initialValue, this.onChanged});

  @override
  _DialTypeDropdownState createState() => _DialTypeDropdownState(initialValue);
}

class _DialTypeDropdownState extends State<DialTypeDropdown> {
  DialType _dialType;

  _DialTypeDropdownState(this._dialType);

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
      Text(
        "Sensor Type",
        textAlign: TextAlign.left,
      ),
      DropdownButton<DialType>(
        value: _dialType,
        iconSize: 24,
        style: const TextStyle(color: Colors.black),
        focusColor: Colors.white,
        hint: Text(
          "Select sensor type",
          style: TextStyle(
              color: Colors.black, fontSize: 14, fontWeight: FontWeight.w500),
        ),
        onChanged: (DialType? newValue) {
          if (newValue != null) {
            setState(() => _dialType = newValue);
            widget.onChanged?.call(newValue);
          }
        },
        isExpanded: true,
        items: <DialType>[DialType.temperature, DialType.moisture]
            .map<DropdownMenuItem<DialType>>((DialType value) {
          return DropdownMenuItem<DialType>(
            value: value,
            child: Text(
              value.toString().split('.').last,
            ),
          );
        }).toList(),
      )
    ]);
  }
}

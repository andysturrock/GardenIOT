import 'package:flutter/material.dart';

class DialTypeDropdown extends StatefulWidget {
  @override
  _DialTypeDropdownState createState() => _DialTypeDropdownState();
}

enum DialType { temperature, moisture }

class _DialTypeDropdownState extends State<DialTypeDropdown> {
  DialType _dialType = DialType.temperature;

  DialType get dialType => _dialType;

  @override
  Widget build(BuildContext context) {
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
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
          setState(() {
            _dialType = newValue!;
          });
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

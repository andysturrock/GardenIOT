import 'package:flutter/material.dart';
import 'dial_type_dropdown.dart';
import 'sensor_id_picker.dart';

class DialAttributes {
  String dialName;
  DialType dialType;
  int sensorId;

  DialAttributes(
      {required this.dialName,
      required this.dialType,
      required this.sensorId}) {}

  DialAttributes.fromJson(Map<String, dynamic> json)
      : dialName = json["dialName"].toString(),
        dialType = DialType.values[int.parse(json["dialType"])],
        sensorId = int.parse(json["sensorId"]) {}

  Map<String, dynamic> toJson() => {
        'dialName': dialName,
        'dialType': dialType.index,
        'sensorId': sensorId,
      };
}

class DialEditor extends StatefulWidget {
  @override
  _DialEditorState createState() => _DialEditorState();

  final dialAttributes = DialAttributes(
      dialName: "My New Sensor", dialType: DialType.temperature, sensorId: 1);
}

class _DialEditorState extends State<DialEditor> {
  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Column(crossAxisAlignment: CrossAxisAlignment.center, children: [
          Text(
            "Sensor Name",
            textAlign: TextAlign.left,
          ),
          TextFormField(
            onChanged: (value) => {widget.dialAttributes.dialName = value},
            // controller: _textFieldController,
            decoration:
                InputDecoration(hintText: widget.dialAttributes.dialName),
            initialValue: widget.dialAttributes.dialName,
          )
        ]),
        SizedBox(height: 20),
        DialTypeDropdown(
          initialValue: widget.dialAttributes.dialType,
          onChanged: (value) => {widget.dialAttributes.dialType = value},
        ),
        SizedBox(height: 20),
        SensorIdPicker(
          minValue: 0,
          maxValue: 2,
          initialValue: widget.dialAttributes.sensorId,
          onChanged: (value) => {widget.dialAttributes.sensorId = value},
        ),
      ],
    );
  }
}

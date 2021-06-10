import 'package:flutter/material.dart';
import 'dial_type_dropdown.dart';

class DialEditor extends StatefulWidget {
  @override
  _DialEditorState createState() => _DialEditorState();
}

class _DialEditorState extends State<DialEditor> {
  String _dialName = "";
  int sensorId = -1;
  TextEditingController _textFieldController = TextEditingController();

  String get dialName => _dialName;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        TextField(
          onChanged: (value) {
            setState(() {
              _dialName = value;
            });
          },
          controller: _textFieldController,
          decoration: InputDecoration(hintText: "Sensor Name"),
        ),
        SizedBox(height: 10),
        DialTypeDropdown(),
        TextField(
          onChanged: (value) {
            setState(() {
              _dialName = value;
            });
          },
          controller: _textFieldController,
          decoration: InputDecoration(hintText: "Sensor ID"),
        ),
      ],
    );
  }
}

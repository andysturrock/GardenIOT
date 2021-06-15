import 'package:flutter/material.dart';
import 'package:garden_iot/dial_editor.dart';
import 'package:garden_iot/dial_type_dropdown.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';

class DialsGrid extends StatefulWidget {
  @override
  _DialsGridState createState() => _DialsGridState();
}

class _DialsGridState extends State<DialsGrid> {
  final List<Widget> _dials = [];

  Future<DialAttributes?> _displayDialEditorDialog(BuildContext context) async {
    return await showDialog(
        context: context,
        builder: (BuildContext context) {
          final dialEditor = DialEditor();
          return AlertDialog(
            title: Text('Add new sensor'),
            content: dialEditor,
            actions: <Widget>[
              TextButton(
                child: Text('CANCEL'),
                onPressed: () {
                  Navigator.pop(context);
                },
              ),
              TextButton(
                child: Text('OK'),
                onPressed: () {
                  Navigator.pop(context, dialEditor.dialAttributes);
                },
              ),
            ],
          );
        });
  }

  @override
  Widget build(BuildContext context) {
    if (_dials.length == 0) {
      final addNewSensor = Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.add_box),
            tooltip: 'Add new sensor',
            onPressed: () async {
              DialAttributes? dialAttributes =
                  await _displayDialEditorDialog(context);
              if (dialAttributes != null) {
                setState(() {
                  if (dialAttributes.dialType == DialType.temperature) {
                    final newTempDial = TemperatureDial(
                        temperatureModel: context.read<TemperatureModel>(),
                        sensorId: dialAttributes.sensorId,
                        name: dialAttributes.dialName);
                    _dials.add(newTempDial);
                  } else {
                    //TODO new MoistureDial
                  }
                });
              } else {
                print("The user pressed cancel or back");
              }
            },
          ),
          Text('Add new sensor')
        ],
      );
      _dials.add(addNewSensor);
    }

    final orientation = MediaQuery.of(context).orientation;
    var gridView = GridView.builder(
        itemCount: _dials.length,
        gridDelegate: new SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: (orientation == Orientation.portrait) ? 2 : 3),
        itemBuilder: (BuildContext context, int index) {
          return _dials[index];
        });
    return gridView;
  }
}

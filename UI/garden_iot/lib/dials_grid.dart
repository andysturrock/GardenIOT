import 'package:flutter/material.dart';
import 'package:garden_iot/dial_editor.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';

class DialsGrid extends StatefulWidget {
  @override
  _DialsGridState createState() => _DialsGridState();
}

class _DialsGridState extends State<DialsGrid> {
  final List<Widget> _dials = [];
  TextEditingController _textFieldController = TextEditingController();

  Future<Widget?> _displayTextInputDialog(BuildContext context) async {
    String widgetName = "";
    Widget? myThing = await showDialog(
        context: context,
        builder: (BuildContext context) {
          return AlertDialog(
            title: Text('Add new sensor'),
            content: DialEditor(),
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
                  Navigator.pop(context, Text(widgetName));
                },
              ),
            ],
          );
        });
    return myThing;
  }

  @override
  Widget build(BuildContext context) {
    final temperatureDial0 = TemperatureDial(
        temperatureModel: context.read<TemperatureModel>(),
        sensorId: 0,
        name: "External");
    final temperatureDial1 = TemperatureDial(
        temperatureModel: context.read<TemperatureModel>(),
        sensorId: 1,
        name: "Greenhouse");
    final temperatureDial2 = TemperatureDial(
        temperatureModel: context.read<TemperatureModel>(),
        sensorId: 2,
        name: "Shed");
    if (_dials.length == 0) {
      _dials.add(temperatureDial0);
      _dials.add(temperatureDial1);
      _dials.add(temperatureDial2);
      final addNewSensor = Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          IconButton(
            icon: const Icon(Icons.add_box),
            tooltip: 'Add new sensor',
            onPressed: () async {
              Widget? myThing = await _displayTextInputDialog(context);
              if (myThing != null) {
                setState(() {
                  _dials.add(myThing);
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

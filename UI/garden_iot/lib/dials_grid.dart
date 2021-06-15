import 'package:flutter/material.dart';
import 'package:garden_iot/dial_editor.dart';
import 'package:garden_iot/dial_grid_tile.dart';
import 'package:garden_iot/dial_type_dropdown.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';

import 'new_dial_button.dart';

class DialsGrid extends StatefulWidget {
  @override
  _DialsGridState createState() => _DialsGridState();
}

class _DialsGridState extends State<DialsGrid> {
  final List<Widget> _dials = [];

  @override
  void initState() {
    super.initState();
    _dials.add(NewDialButton(
      onPressed: (DialAttributes dialAttributes) {
        _addNewDial(dialAttributes);
      },
    ));
  }

  @override
  Widget build(BuildContext context) {
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

  void _addNewDial(DialAttributes dialAttributes) {
    setState(() {
      if (dialAttributes.dialType == DialType.temperature) {
        final newTemperatureDial = TemperatureDial(
          temperatureModel: context.read<TemperatureModel>(),
          sensorId: dialAttributes.sensorId,
          dialName: dialAttributes.dialName,
        );
        final newTileIndex = _dials.length;
        final newDialGridTile = DialGridTile(
          index: _dials.length,
          dial: newTemperatureDial,
          onLongPress: () {
            Future<dynamic> result = showMenu(
                context: context,
                items: <PopupMenuEntry>[
                  PopupMenuItem(
                    value: newTileIndex,
                    child: Row(
                      children: <Widget>[
                        Icon(Icons.delete),
                        Text("Delete"),
                      ],
                    ),
                  )
                ],
                position: RelativeRect.fill);
            result.then((value) {
              if (value != null) {
                print("removing dial at index ${value.toString()}");
                _dials.removeAt(value);
              }
            });
          },
        );
        _dials.add(newDialGridTile);
      } else {
        //TODO new MoistureDial
      }
    });
  }
}

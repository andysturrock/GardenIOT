import 'package:flutter/material.dart';
import 'package:garden_iot/dial_editor.dart';
import 'package:garden_iot/dial_grid_tile.dart';
import 'package:garden_iot/dial_type_dropdown.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';

import 'new_dial_button.dart';

typedef VoidFunction = void Function();

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

  void _removeDial(Key key) {
    setState(() {
      // O(n) linear search is a bit disgusting but there won't
      // ever be too many items in the list so don't worry for now.
      for (var index = 0; index < _dials.length; ++index) {
        if (_dials[index].key == key) {
          _dials.removeAt(index);
          break;
        }
      }
    });
  }

  void _addNewDial(DialAttributes dialAttributes) {
    setState(() {
      if (dialAttributes.dialType == DialType.temperature) {
        final newTemperatureDial = TemperatureDial(
          temperatureModel: context.read<TemperatureModel>(),
          sensorId: dialAttributes.sensorId,
          dialName: dialAttributes.dialName,
        );
        final dialKey = UniqueKey();
        final newDialGridTile = DialGridTile(
          key: dialKey,
          initialIndex: _dials.length,
          dial: newTemperatureDial,
          onDeleteTile: (index) => _removeDial(dialKey),
        );
        _dials.add(newDialGridTile);
      } else {
        //TODO new MoistureDial
      }
    });
  }
}

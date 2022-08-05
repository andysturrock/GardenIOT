import 'package:flutter/material.dart';
import 'package:garden_iot/dial_editor.dart';
import 'package:garden_iot/dial_grid_tile.dart';
import 'package:garden_iot/dial_type_dropdown.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';
import 'dart:io';
import 'package:path_provider/path_provider.dart';
import 'dart:convert';
import 'new_dial_button.dart';

typedef VoidFunction = void Function();

class DialsGrid extends StatefulWidget {
  @override
  _DialsGridState createState() => _DialsGridState();
}

class _DialsGridState extends State<DialsGrid> {
  List<DialGridTile> _dials = [];
  static const dialsFilename = "dial_attributes.json";

  Future<String> get _localFilePath async {
    final directory = await getApplicationDocumentsDirectory();

    return "$directory.path/$dialsFilename";
  }

  Future<List<DialGridTile>> _loadFromPersistentStorage() async {
    final localFilePath = await _localFilePath;

    List<DialGridTile> dials = [];
    if (await File(localFilePath).exists()) {
      final localFile = File(localFilePath);
      final jsonString = await localFile.readAsString();
      try {
        List<dynamic> json = jsonDecode(jsonString);
        for (final dialAttributesJson in json) {
          var dialAttributes = DialAttributes.fromJson(dialAttributesJson);
          _dials.add(_createNewDialGridTile(dialAttributes));
        }
      } catch (error) {
        // The file has somehow become corrupted.
        // Best thing we can do here is delete the file and carry on.
        await localFile.delete();
      }
    }

    return dials;
  }

  Future<void> _saveToPersistentStorage(List<DialGridTile> dials) async {
    final localFile = File(await _localFilePath);
    var jsonString = jsonEncode(dials);
    await localFile.writeAsString(jsonString);
  }

  @override
  void initState() {
    super.initState();
    final persistedDials = _loadFromPersistentStorage();
    persistedDials.then((dials) {
      setState(() {
        _dials = dials;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;

    final List<Widget> dialsPlusAddButton = [];
    dialsPlusAddButton.addAll(_dials);
    dialsPlusAddButton.add(NewDialButton(
      onPressed: (DialAttributes dialAttributes) {
        _addNewDial(dialAttributes);
      },
    ));
    final gridView = GridView.builder(
        itemCount: dialsPlusAddButton.length,
        gridDelegate: new SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: (orientation == Orientation.portrait) ? 2 : 3),
        itemBuilder: (BuildContext context, int index) {
          return dialsPlusAddButton[index];
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
          _saveToPersistentStorage(_dials).whenComplete(() => null);
          break;
        }
      }
    });
  }

  DialGridTile _createNewDialGridTile(DialAttributes dialAttributes) {
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
        dialAttributes: dialAttributes,
        onDeleteTile: (index) => _removeDial(dialKey),
      );
      return newDialGridTile;
    } else {
      //TODO new MoistureDial
      throw "TODO new MoistureDial";
    }
  }

  void _addNewDial(DialAttributes dialAttributes) {
    setState(() {
      _dials.add(_createNewDialGridTile(dialAttributes));
      _saveToPersistentStorage(_dials).whenComplete(() => null);
    });
  }
}

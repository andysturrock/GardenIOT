import 'package:flutter/material.dart';
import 'package:garden_iot/water_now_button.dart';

class WaterNowGrid extends StatefulWidget {
  @override
  _WaterNowGridState createState() => _WaterNowGridState();
}

class _WaterNowGridState extends State<WaterNowGrid> {
  @override
  Widget build(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    var switches = <Widget>[
      // TODO get this from config somewhere
      WaterNowButton("Greenhouse", 1),
      WaterNowButton("Flowers", 2),
      WaterNowButton("Strawberries", 3),
      WaterNowButton("Sweetcorn", 4),
    ];
    final gridView = GridView.builder(
        itemCount: switches.length,
        gridDelegate: new SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: (orientation == Orientation.portrait) ? 2 : 3),
        itemBuilder: (BuildContext context, int index) {
          return switches[index];
        });
    return gridView;
  }
}

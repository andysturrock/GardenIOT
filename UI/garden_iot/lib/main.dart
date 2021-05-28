import 'package:flutter/material.dart';
import 'package:garden_iot/temperature_dial.dart';

void main() => runApp(MyApp());

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
        title: 'Greenhouse',
        theme: ThemeData(
          primaryColor: Colors.white,
        ),
        // home: RandomWords(),
        home: Scaffold(
            appBar: AppBar(
              title: Text('Greenhouse'),
            ),
            body: TemperatureDial(location: "External")));
  }
}

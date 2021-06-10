import 'package:flutter/material.dart';
import 'package:garden_iot/dials_grid.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:provider/provider.dart';

void main() {
  final pollPeriod = new Duration(seconds: 5);
  runApp(
    /// Providers are above [MyApp] instead of inside it, so that tests
    /// can use [MyApp] while mocking the providers
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => TemperatureModel(pollPeriod)),
      ],
      child: MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
        title: 'Greenhouse',
        theme: ThemeData(
          primaryColor: Colors.white,
        ),
        home: Scaffold(
            appBar: AppBar(
              title: Text('Garden IOT'),
            ),
            body: DialsGrid()));
  }
}

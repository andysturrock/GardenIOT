import 'package:flutter/material.dart';
import 'package:garden_iot/dials_grid.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/water_now.dart';
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
      home: DefaultTabController(
        length: 2,
        child: Scaffold(
          appBar: AppBar(
            bottom: const TabBar(
              tabs: [
                Tab(icon: Icon(Icons.home)),
                Tab(icon: Icon(Icons.water)),
              ],
            ),
            title: const Text('Tabs Demo'),
          ),
          body: TabBarView(
            children: [
              // TODO this recreates the entire DialsGrid each time the tab is opened.
              // Need to persist state.
              DialsGrid(),
              WaterNowGrid(),
            ],
          ),
        ),
      ),
    );
  }
}

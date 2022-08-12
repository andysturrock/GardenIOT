import 'package:flutter/material.dart';
import 'package:garden_iot/dials_grid.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/logger.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/water_now_grid.dart';
import 'package:provider/provider.dart';

void main() {
  final pollPeriod = new Duration(seconds: 5);
  LogModel logModel = LogModel();
  runApp(
    /// Providers are above [MyApp] instead of inside it, so that tests
    /// can use [MyApp] while mocking the providers
    MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => TemperatureModel(pollPeriod)),
        Provider<ShadowRelayModel>(create: (_) => ShadowRelayModel(logModel)),
        Provider<LogModel>(create: (_) => logModel),
      ],
      child: MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  final DialsGrid _dialsGrid = DialsGrid();
  final Logger _logger = Logger();
  late String _title;

  MyApp() {
    final envName = Env.envName();
    _title = 'Garden IOT ($envName)';
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      home: DefaultTabController(
        length: 3,
        child: Scaffold(
          appBar: AppBar(
            bottom: const TabBar(
              tabs: [
                Tab(icon: Icon(Icons.home)),
                Tab(icon: Icon(Icons.water_drop)),
                Tab(icon: Icon(Icons.text_fields_rounded)),
              ],
            ),
            title: Text(_title),
          ),
          body: TabBarView(
            children: [_dialsGrid, WaterNowGrid(), _logger],
          ),
        ),
      ),
    );
  }
}

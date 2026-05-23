import 'package:flutter/material.dart';
import 'package:garden_iot/dials_grid.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/logger.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/schedule_screen.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/water_now_grid.dart';
import 'package:provider/provider.dart';

void main() {
  const pollPeriod = Duration(seconds: 5);
  final logModel = LogModel();
  final gateway = MqttGateway(logModel);
  runApp(
    MultiProvider(
      providers: [
        Provider<LogModel>.value(value: logModel),
        // ListenableProvider because MqttGatewayLike is a Listenable; only
        // context.read is used here, but `provider` rejects a plain Provider
        // for Listenable subtypes.
        ListenableProvider<MqttGatewayLike>.value(value: gateway),
        ChangeNotifierProvider(
            create: (_) => TemperatureModel(pollPeriod, logModel)),
        ChangeNotifierProvider(
            create: (_) => ShadowRelayModel(logModel, gateway)),
        ChangeNotifierProvider(
            create: (_) => GardenConfigModel(logModel, gateway)),
      ],
      child: const MyApp(),
    ),
  );
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Garden IOT',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: ThemeMode.system,
      home: const _AppShell(),
    );
  }
}

class _AppShell extends StatefulWidget {
  const _AppShell();

  @override
  State<_AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<_AppShell> {
  static const List<_Destination> _destinations = [
    _Destination(
      icon: Icons.thermostat_outlined,
      selectedIcon: Icons.thermostat,
      label: 'Sensors',
    ),
    _Destination(
      icon: Icons.water_drop_outlined,
      selectedIcon: Icons.water_drop,
      label: 'Water',
    ),
    _Destination(
      icon: Icons.schedule_outlined,
      selectedIcon: Icons.schedule,
      label: 'Schedule',
    ),
    _Destination(
      icon: Icons.article_outlined,
      selectedIcon: Icons.article,
      label: 'Logs',
    ),
  ];

  int _index = 0;
  bool _mqttBootstrapped = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_mqttBootstrapped) {
      _mqttBootstrapped = true;
      final bundle = DefaultAssetBundle.of(context);
      final gateway = context.read<MqttGatewayLike>();
      WidgetsBinding.instance.addPostFrameCallback((_) {
        gateway.mqttConnect(bundle);
      });
    }
  }

  @override
  void dispose() {
    context.read<MqttGatewayLike>().mqttDisconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Garden IOT'),
      ),
      body: SafeArea(
        child: IndexedStack(
          index: _index,
          children: const [
            DialsGrid(),
            WaterNowGrid(),
            ScheduleScreen(),
            LoggerView(),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final d in _destinations)
            NavigationDestination(
              icon: Icon(d.icon),
              selectedIcon: Icon(d.selectedIcon),
              label: d.label,
            ),
        ],
      ),
    );
  }
}

class _Destination {
  final IconData icon;
  final IconData selectedIcon;
  final String label;

  const _Destination({
    required this.icon,
    required this.selectedIcon,
    required this.label,
  });
}

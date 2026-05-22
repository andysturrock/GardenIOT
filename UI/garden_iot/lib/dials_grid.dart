import 'package:flutter/material.dart';
import 'package:garden_iot/temperature_dial.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/utils/env.dart';

class DialsGrid extends StatelessWidget {
  /// Lets tests pass a custom sensor list. Defaults to AppConfig.sensors.
  const DialsGrid({super.key, this.sensors = AppConfig.sensors});

  final List<SensorConfig> sensors;

  int _columnsFor(double width) {
    if (width < 360) return 1;
    if (width < 720) return 2;
    return 3;
  }

  @override
  Widget build(BuildContext context) {
    if (sensors.isEmpty) {
      return Center(
        child: Text(
          'No sensors configured.',
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      );
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        return GridView.builder(
          padding: const EdgeInsets.all(AppSpacing.sm),
          itemCount: sensors.length,
          gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: _columnsFor(constraints.maxWidth),
            childAspectRatio: 1,
          ),
          itemBuilder: (context, index) {
            final sensor = sensors[index];
            return TemperatureDial(sensor: sensor);
          },
        );
      },
    );
  }
}

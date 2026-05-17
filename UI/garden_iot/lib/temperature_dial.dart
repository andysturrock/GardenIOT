import 'package:flutter/material.dart';
import 'package:garden_iot/temperature_model.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:provider/provider.dart';
import 'package:syncfusion_flutter_gauges/gauges.dart';

class TemperatureDial extends StatelessWidget {
  final SensorConfig sensor;

  const TemperatureDial({super.key, required this.sensor});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.only(top: AppSpacing.xs),
              child: Text(
                sensor.name,
                style: textTheme.titleMedium,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            Expanded(
              child: Consumer<TemperatureModel>(
                builder: (context, model, _) {
                  final reading = model.readingFor(sensor.sensorId);
                  return _Gauge(
                    sensor: sensor,
                    temperature: reading?.temperature,
                    colorScheme: colorScheme,
                    textTheme: textTheme,
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Gauge extends StatelessWidget {
  final SensorConfig sensor;
  final double? temperature;
  final ColorScheme colorScheme;
  final TextTheme textTheme;

  const _Gauge({
    required this.sensor,
    required this.temperature,
    required this.colorScheme,
    required this.textTheme,
  });

  @override
  Widget build(BuildContext context) {
    final value = temperature ?? sensor.minTemp;
    final hasReading = temperature != null;
    return SfRadialGauge(
      axes: [
        RadialAxis(
          minimum: sensor.minTemp,
          maximum: sensor.maxTemp,
          axisLineStyle: AxisLineStyle(
            thickness: 0.12,
            thicknessUnit: GaugeSizeUnit.factor,
            color: colorScheme.surfaceContainerHighest,
          ),
          majorTickStyle: MajorTickStyle(color: colorScheme.outlineVariant),
          minorTickStyle: MinorTickStyle(color: colorScheme.outlineVariant),
          axisLabelStyle: GaugeTextStyle(color: colorScheme.onSurfaceVariant),
          ranges: [
            GaugeRange(
              startValue: sensor.minTemp,
              endValue: sensor.minComfort,
              color: colorScheme.tertiary,
              startWidth: 0.12,
              endWidth: 0.12,
              sizeUnit: GaugeSizeUnit.factor,
            ),
            GaugeRange(
              startValue: sensor.minComfort,
              endValue: sensor.maxComfort,
              color: colorScheme.primary,
              startWidth: 0.12,
              endWidth: 0.12,
              sizeUnit: GaugeSizeUnit.factor,
            ),
            GaugeRange(
              startValue: sensor.maxComfort,
              endValue: sensor.maxTemp,
              color: colorScheme.error,
              startWidth: 0.12,
              endWidth: 0.12,
              sizeUnit: GaugeSizeUnit.factor,
            ),
          ],
          pointers: [
            NeedlePointer(
              value: value,
              needleColor: colorScheme.onSurface,
              knobStyle: KnobStyle(color: colorScheme.onSurface),
              tailStyle: TailStyle(
                color: colorScheme.onSurface,
                length: 0.15,
                width: 4,
              ),
            ),
          ],
          annotations: [
            GaugeAnnotation(
              angle: 90,
              positionFactor: 0.55,
              widget: Text(
                hasReading ? '${value.toStringAsFixed(1)}°' : '—',
                style: textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w600,
                  color: colorScheme.onSurface,
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

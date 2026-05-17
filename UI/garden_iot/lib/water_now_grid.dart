import 'package:flutter/material.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/water_now_button.dart';
import 'package:provider/provider.dart';

class WaterNowGrid extends StatelessWidget {
  const WaterNowGrid({super.key});

  int _columnsFor(double width) {
    if (width < 360) return 1;
    if (width < 720) return 2;
    return 3;
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<ShadowRelayModel>(
      builder: (context, model, _) {
        return Column(
          children: [
            _ConnectionBanner(model: model),
            Expanded(
              child: LayoutBuilder(
                builder: (context, constraints) {
                  return GridView.builder(
                    padding: const EdgeInsets.all(AppSpacing.sm),
                    itemCount: AppConfig.relays.length,
                    gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: _columnsFor(constraints.maxWidth),
                      childAspectRatio: 1,
                    ),
                    itemBuilder: (context, index) {
                      final relay = AppConfig.relays[index];
                      return WaterNowButton(
                        relay: relay,
                        reportedState: model.reportedStateFor(relay.relayId),
                        enabled: model.isConnected,
                        onToggle: (value) => model.setDesiredState(
                          relay.relayId,
                          value ? RelayState.open : RelayState.closed,
                        ),
                      );
                    },
                  );
                },
              ),
            ),
          ],
        );
      },
    );
  }
}

class _ConnectionBanner extends StatelessWidget {
  final ShadowRelayModel model;

  const _ConnectionBanner({required this.model});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    switch (model.connectionState) {
      case MqttConnectivity.connected:
        return const SizedBox.shrink();
      case MqttConnectivity.connecting:
        return Container(
          width: double.infinity,
          color: colorScheme.secondaryContainer,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              SizedBox(
                height: 16,
                width: 16,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: colorScheme.onSecondaryContainer,
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Text(
                'Connecting…',
                style: TextStyle(color: colorScheme.onSecondaryContainer),
              ),
            ],
          ),
        );
      case MqttConnectivity.disconnected:
        return Container(
          width: double.infinity,
          color: colorScheme.errorContainer,
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          child: Row(
            children: [
              Icon(Icons.wifi_off, color: colorScheme.onErrorContainer),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Text(
                  'Disconnected from broker',
                  style: TextStyle(color: colorScheme.onErrorContainer),
                ),
              ),
              TextButton(
                onPressed: () {
                  final bundle = DefaultAssetBundle.of(context);
                  model.mqttConnect(bundle);
                },
                style: TextButton.styleFrom(
                  foregroundColor: colorScheme.onErrorContainer,
                ),
                child: const Text('Retry'),
              ),
            ],
          ),
        );
    }
  }
}

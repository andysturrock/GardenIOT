import 'package:flutter/material.dart';
import 'package:garden_iot/bed_rename_sheet.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
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
    return Consumer2<ShadowRelayModel, GardenConfigModel>(
      builder: (context, relayModel, configModel, _) {
        return Column(
          children: [
            _ConnectionBanner(connectionState: relayModel.connectionState),
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
                      final name = configModel.bedName(relay.relayId);
                      return WaterNowButton(
                        relay: relay,
                        name: name,
                        reportedState:
                            relayModel.reportedStateFor(relay.relayId),
                        enabled: relayModel.isConnected,
                        onToggle: (value) => relayModel.setDesiredState(
                          relay.relayId,
                          value ? RelayState.open : RelayState.closed,
                        ),
                        onLongPress: configModel.config == null
                            ? null
                            : () => BedRenameSheet.show(
                                  context,
                                  relayId: relay.relayId,
                                  initialName: name,
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
  final MqttConnectivity connectionState;

  const _ConnectionBanner({required this.connectionState});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    switch (connectionState) {
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
                  context.read<MqttGatewayLike>().mqttConnect(bundle);
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

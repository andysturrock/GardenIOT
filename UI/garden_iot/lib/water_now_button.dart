import 'package:flutter/material.dart';
import 'package:garden_iot/serialization/shadow_message.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/utils/env.dart';

class WaterNowButton extends StatelessWidget {
  final RelayConfig relay;
  final String name;
  final RelayState? reportedState;
  final bool enabled;
  final ValueChanged<bool> onToggle;
  final VoidCallback? onLongPress;

  const WaterNowButton({
    super.key,
    required this.relay,
    required this.name,
    required this.reportedState,
    required this.enabled,
    required this.onToggle,
    this.onLongPress,
  });

  IconData _iconFor(IconCodepoint icon) {
    switch (icon) {
      case IconCodepoint.spa:
        return Icons.spa_outlined;
      case IconCodepoint.localFlorist:
        return Icons.local_florist_outlined;
      case IconCodepoint.agriculture:
        return Icons.agriculture_outlined;
      case IconCodepoint.grass:
        return Icons.grass_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    final isOpen = reportedState?.isOpen ?? false;
    return Card(
      child: InkWell(
        onTap: enabled ? () => onToggle(!isOpen) : null,
        onLongPress: onLongPress,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Icon(
                    _iconFor(relay.icon),
                    color: isOpen ? colorScheme.primary : colorScheme.onSurfaceVariant,
                    size: 32,
                  ),
                  Switch.adaptive(
                    value: isOpen,
                    onChanged: enabled ? onToggle : null,
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                name,
                style: textTheme.titleMedium,
                overflow: TextOverflow.ellipsis,
              ),
              Text(
                reportedState == null
                    ? 'Unknown'
                    : (isOpen ? 'Watering' : 'Off'),
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

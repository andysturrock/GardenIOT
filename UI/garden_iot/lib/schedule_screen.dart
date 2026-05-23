import 'package:flutter/material.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/schedule_editor.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:provider/provider.dart';

class ScheduleScreen extends StatelessWidget {
  const ScheduleScreen({super.key});

  Future<void> _openEditor(BuildContext context, {WateringJobConfig? job}) {
    return Navigator.of(context).push(
      MaterialPageRoute<WateringJobConfig>(
        builder: (_) => ScheduleEditor(initial: job),
      ),
    );
  }

  void _onDismissed(BuildContext context, WateringJobConfig job) {
    final model = context.read<GardenConfigModel>();
    final messenger = ScaffoldMessenger.of(context);
    model.deleteJob(job.id);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      SnackBar(
        content: Text('Deleted "${job.name ?? job.id}"'),
        action: SnackBarAction(
          label: 'Undo',
          onPressed: () => model.upsertJob(job),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Consumer<GardenConfigModel>(
      builder: (context, model, _) {
        final cfg = model.config;
        if (cfg == null) {
          return const Center(child: CircularProgressIndicator());
        }
        return Scaffold(
          body: cfg.jobs.isEmpty
              ? const _EmptyState()
              : ListView.builder(
                  padding: const EdgeInsets.symmetric(
                    vertical: AppSpacing.sm,
                  ),
                  itemCount: cfg.jobs.length,
                  itemBuilder: (context, index) {
                    final job = cfg.jobs[index];
                    return Dismissible(
                      key: ValueKey('job-${job.id}'),
                      direction: DismissDirection.endToStart,
                      background: _DeleteBackground(),
                      onDismissed: (_) => _onDismissed(context, job),
                      child: _JobTile(
                        job: job,
                        onTap: () => _openEditor(context, job: job),
                      ),
                    );
                  },
                ),
          floatingActionButton: FloatingActionButton.extended(
            onPressed: () => _openEditor(context),
            icon: const Icon(Icons.add),
            label: const Text('New job'),
          ),
        );
      },
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.water_drop_outlined,
                size: 48, color: Theme.of(context).colorScheme.outline),
            const SizedBox(height: AppSpacing.md),
            Text('No watering jobs yet', style: textTheme.titleMedium),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Tap "New job" to schedule a watering.',
              style: textTheme.bodyMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _DeleteBackground extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Container(
      alignment: Alignment.centerRight,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
      margin: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: colorScheme.errorContainer,
        borderRadius: BorderRadius.circular(AppRadii.md),
      ),
      child: Icon(Icons.delete_outline, color: colorScheme.onErrorContainer),
    );
  }
}

class _JobTile extends StatelessWidget {
  final WateringJobConfig job;
  final VoidCallback onTap;

  const _JobTile({required this.job, required this.onTap});

  static const _isoDayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  String _formatTime() {
    final h = job.hour.toString().padLeft(2, '0');
    final m = job.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  String _formatDuration() {
    final minutes = (job.durationS / 60).round();
    return '$minutes min';
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final configModel = context.watch<GardenConfigModel>();
    final bedNames =
        job.relays.map((id) => configModel.bedName(id)).join(', ');
    return Card(
      child: InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Expanded(
                    child: Text(
                      job.name ?? job.id,
                      style: textTheme.titleMedium,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  Text(
                    '${_formatTime()} • ${_formatDuration()}',
                    style: textTheme.bodyMedium?.copyWith(
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  for (var iso = 1; iso <= 7; iso++) ...[
                    Text(
                      _isoDayLabels[iso - 1],
                      style: textTheme.bodySmall?.copyWith(
                        fontWeight: job.days.contains(iso)
                            ? FontWeight.bold
                            : FontWeight.normal,
                        color: job.days.contains(iso)
                            ? colorScheme.primary
                            : colorScheme.outline,
                      ),
                    ),
                    if (iso < 7) const SizedBox(width: AppSpacing.sm),
                  ],
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                bedNames,
                style: textTheme.bodySmall?.copyWith(
                  color: colorScheme.onSurfaceVariant,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

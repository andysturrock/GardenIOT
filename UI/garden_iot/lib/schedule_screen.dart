import 'dart:async';

import 'package:flutter/material.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/schedule_editor.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/utils/next_fire.dart';
import 'package:provider/provider.dart';
import 'package:timezone/timezone.dart' as tz;

class ScheduleScreen extends StatefulWidget {
  /// Clock injection for tests; production code uses `DateTime.now`.
  final DateTime Function() clock;

  /// How often the countdown text refreshes. One minute is enough
  /// resolution for "in 3h 12m" and trivial on battery. Tests pin this to
  /// `Duration.zero` to disable the periodic refresh entirely.
  final Duration tickPeriod;

  const ScheduleScreen({
    super.key,
    this.clock = DateTime.now,
    this.tickPeriod = const Duration(minutes: 1),
  });

  @override
  State<ScheduleScreen> createState() => _ScheduleScreenState();
}

class _ScheduleScreenState extends State<ScheduleScreen> {
  Timer? _tick;
  late DateTime _now;

  @override
  void initState() {
    super.initState();
    _now = widget.clock();
    if (widget.tickPeriod > Duration.zero) {
      _tick = Timer.periodic(widget.tickPeriod, (_) {
        if (mounted) setState(() => _now = widget.clock());
      });
    }
  }

  @override
  void dispose() {
    _tick?.cancel();
    super.dispose();
  }

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
                        tzName: cfg.tz,
                        now: _now,
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
  final String tzName;
  final DateTime now;
  final VoidCallback onTap;

  const _JobTile({
    required this.job,
    required this.tzName,
    required this.now,
    required this.onTap,
  });

  static const _isoDayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  static const _isoDayShort = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  String _formatTime() {
    final h = job.hour.toString().padLeft(2, '0');
    final m = job.minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  String _formatDuration() {
    final minutes = (job.durationS / 60).round();
    return '$minutes min';
  }

  /// "today 08:00 · in 2h 15m" / "tomorrow 08:00 · in 16h 0m" /
  /// "Wed 08:00 · in 3d 4h", all in the config tz (so a UK garden viewed
  /// from a phone in New York still reads "08:00 today" if it's 08:00 in
  /// London). Returns null if the tz string isn't in the loaded IANA
  /// database — the tile then drops the line silently rather than
  /// crashing the whole Schedule tab.
  String? _formatNextFire() {
    final tz.TZDateTime fire;
    try {
      fire = nextFire(job, tzName, now);
    } catch (_) {
      return null;
    }
    final nowInTz = tz.TZDateTime.from(now, fire.location);
    // Compare wall-clock dates in the config tz, not in device-local time.
    final today =
        tz.TZDateTime(fire.location, nowInTz.year, nowInTz.month, nowInTz.day);
    final fireDay =
        tz.TZDateTime(fire.location, fire.year, fire.month, fire.day);
    final dayOffset = fireDay.difference(today).inDays;
    final String dayLabel;
    if (dayOffset == 0) {
      dayLabel = 'today';
    } else if (dayOffset == 1) {
      dayLabel = 'tomorrow';
    } else {
      dayLabel = _isoDayShort[fire.weekday - 1];
    }
    final hh = fire.hour.toString().padLeft(2, '0');
    final mm = fire.minute.toString().padLeft(2, '0');
    return '$dayLabel $hh:$mm · ${formatCountdown(fire.difference(now))}';
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final colorScheme = Theme.of(context).colorScheme;
    final configModel = context.watch<GardenConfigModel>();
    final bedNames =
        job.relays.map((id) => configModel.bedName(id)).join(', ');
    final nextFireLabel = _formatNextFire();
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
              if (nextFireLabel != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  'Next: $nextFireLabel',
                  style: textTheme.bodySmall?.copyWith(
                    color: colorScheme.primary,
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

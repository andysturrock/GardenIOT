import 'package:flutter/material.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:provider/provider.dart';

/// Full-screen editor for a single watering job. `initial` is null when
/// creating a new job; otherwise it's the job being edited.
class ScheduleEditor extends StatefulWidget {
  final WateringJobConfig? initial;

  const ScheduleEditor({super.key, this.initial});

  static const _isoDayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  @override
  State<ScheduleEditor> createState() => _ScheduleEditorState();
}

class _ScheduleEditorState extends State<ScheduleEditor> {
  late final TextEditingController _nameController;
  late String _id;
  late Set<int> _days;
  late int _hour;
  late int _minute;
  late int _durationMin;
  late Set<int> _relays;

  static const int _minDurationMin = 1;
  static const int _maxDurationMin = 30;

  @override
  void initState() {
    super.initState();
    final initial = widget.initial;
    _id = initial?.id ?? newJobId();
    _nameController = TextEditingController(text: initial?.name ?? '');
    _nameController.addListener(() => setState(() {}));
    _days = {...?initial?.days};
    _hour = initial?.hour ?? 8;
    _minute = initial?.minute ?? 0;
    _durationMin = ((initial?.durationS ?? 300) / 60).round()
        .clamp(_minDurationMin, _maxDurationMin);
    _relays = {...?initial?.relays};
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  bool get _canSave =>
      _nameController.text.trim().isNotEmpty &&
      _days.isNotEmpty &&
      _relays.isNotEmpty &&
      _durationMin >= _minDurationMin;

  Future<void> _pickTime() async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: _hour, minute: _minute),
    );
    if (picked == null) return;
    setState(() {
      _hour = picked.hour;
      _minute = picked.minute;
    });
  }

  void _save() {
    final job = WateringJobConfig(
      id: _id,
      name: _nameController.text.trim(),
      days: _days.toList()..sort(),
      hour: _hour,
      minute: _minute,
      durationS: _durationMin * 60,
      relays: _relays.toList()..sort(),
    );
    context.read<GardenConfigModel>().upsertJob(job);
    Navigator.of(context).pop(job);
  }

  String _formatTime() {
    final h = _hour.toString().padLeft(2, '0');
    final m = _minute.toString().padLeft(2, '0');
    return '$h:$m';
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final configModel = context.watch<GardenConfigModel>();
    return Scaffold(
      appBar: AppBar(
        title: Text(widget.initial == null ? 'New job' : 'Edit job'),
        actions: [
          TextButton(
            onPressed: _canSave ? _save : null,
            child: const Text('Save'),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(AppSpacing.md),
        children: [
          TextField(
            controller: _nameController,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Name',
              border: OutlineInputBorder(),
            ),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('Days', style: textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            children: [
              for (var iso = 1; iso <= 7; iso++)
                FilterChip(
                  label: Text(ScheduleEditor._isoDayLabels[iso - 1]),
                  selected: _days.contains(iso),
                  onSelected: (sel) => setState(() {
                    if (sel) {
                      _days.add(iso);
                    } else {
                      _days.remove(iso);
                    }
                  }),
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('Time', style: textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          OutlinedButton.icon(
            onPressed: _pickTime,
            icon: const Icon(Icons.access_time),
            label: Text(_formatTime()),
          ),
          const SizedBox(height: AppSpacing.lg),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('Duration', style: textTheme.titleMedium),
              Text('$_durationMin min', style: textTheme.bodyLarge),
            ],
          ),
          Slider(
            value: _durationMin.toDouble(),
            min: _minDurationMin.toDouble(),
            max: _maxDurationMin.toDouble(),
            divisions: _maxDurationMin - _minDurationMin,
            label: '$_durationMin min',
            onChanged: (v) => setState(() => _durationMin = v.round()),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text('Beds', style: textTheme.titleMedium),
          const SizedBox(height: AppSpacing.sm),
          Wrap(
            spacing: AppSpacing.sm,
            children: [
              for (final relay in AppConfig.relays)
                FilterChip(
                  label: Text(configModel.bedName(relay.relayId)),
                  selected: _relays.contains(relay.relayId),
                  onSelected: (sel) => setState(() {
                    if (sel) {
                      _relays.add(relay.relayId);
                    } else {
                      _relays.remove(relay.relayId);
                    }
                  }),
                ),
            ],
          ),
        ],
      ),
    );
  }
}

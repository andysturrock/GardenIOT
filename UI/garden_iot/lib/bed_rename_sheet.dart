import 'package:flutter/material.dart';
import 'package:garden_iot/garden_config_model.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:provider/provider.dart';

/// Long-press a relay tile in the Water tab to open this.
class BedRenameSheet extends StatefulWidget {
  final int relayId;
  final String initialName;

  const BedRenameSheet({
    super.key,
    required this.relayId,
    required this.initialName,
  });

  /// Shows the sheet and returns the new name if the user saved, or null
  /// if they dismissed it.
  static Future<String?> show(
    BuildContext context, {
    required int relayId,
    required String initialName,
  }) {
    return showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheetContext) => BedRenameSheet(
        relayId: relayId,
        initialName: initialName,
      ),
    );
  }

  @override
  State<BedRenameSheet> createState() => _BedRenameSheetState();
}

class _BedRenameSheetState extends State<BedRenameSheet> {
  late final TextEditingController _controller;
  String _current = '';

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.initialName)
      ..addListener(() => setState(() => _current = _controller.text));
    _current = widget.initialName;
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _canSave => _current.trim().isNotEmpty;

  void _save() {
    final next = _current.trim();
    final model = context.read<GardenConfigModel>();
    model.renameBed(widget.relayId, next);
    Navigator.of(context).pop(next);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final mediaQuery = MediaQuery.of(context);
    return Padding(
      padding: EdgeInsets.only(
        left: AppSpacing.md,
        right: AppSpacing.md,
        top: AppSpacing.md,
        bottom: mediaQuery.viewInsets.bottom + AppSpacing.md,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Rename bed', style: textTheme.titleLarge),
          const SizedBox(height: AppSpacing.md),
          TextField(
            controller: _controller,
            autofocus: true,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(
              labelText: 'Bed name',
              border: OutlineInputBorder(),
            ),
            onSubmitted: (_) {
              if (_canSave) _save();
            },
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              TextButton(
                onPressed: () => Navigator.of(context).pop(),
                child: const Text('Cancel'),
              ),
              const SizedBox(width: AppSpacing.sm),
              FilledButton(
                onPressed: _canSave ? _save : null,
                child: const Text('Save'),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

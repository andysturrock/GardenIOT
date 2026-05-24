import 'package:flutter/material.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/serialization/log_record.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:provider/provider.dart';

class LoggerView extends StatefulWidget {
  const LoggerView({super.key});

  @override
  State<LoggerView> createState() => _LoggerViewState();
}

class _LoggerViewState extends State<LoggerView> {
  static const double _loadMoreThresholdPx = 200;

  LogCategory _category = LogCategory.user;
  final ScrollController _scroll = ScrollController();
  LogModel? _model;
  bool _kickedOff = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final model = context.read<LogModel>();
    if (_model != model) {
      _model = model;
      _scroll.addListener(_maybeLoadMore);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) return;
        _kickoffIfNeeded();
      });
    }
  }

  @override
  void dispose() {
    _scroll.removeListener(_maybeLoadMore);
    _scroll.dispose();
    super.dispose();
  }

  void _kickoffIfNeeded() {
    final model = _model;
    if (model == null || _kickedOff) return;
    if (model.displayedFor(_category).isEmpty &&
        model.hasMore(_category) &&
        !model.isLoadingMore(_category)) {
      _kickedOff = true;
      model.loadMore(_category);
    }
  }

  void _maybeLoadMore() {
    final model = _model;
    if (model == null || !_scroll.hasClients) return;
    final pos = _scroll.position;
    if (pos.maxScrollExtent - pos.pixels <= _loadMoreThresholdPx) {
      if (model.hasMore(_category) && !model.isLoadingMore(_category)) {
        model.loadMore(_category);
      }
    }
  }

  void _onCategoryChanged(Set<LogCategory> selected) {
    final next = selected.first;
    if (next == _category) return;
    setState(() {
      _category = next;
      _kickedOff = false;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      // Reset scroll so the user sees the top (live tail) when switching.
      if (_scroll.hasClients) {
        _scroll.jumpTo(0);
      }
      _kickoffIfNeeded();
    });
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    return Consumer<LogModel>(
      builder: (context, model, _) {
        final items = model.displayedFor(_category);
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.md,
                vertical: AppSpacing.sm,
              ),
              child: SegmentedButton<LogCategory>(
                segments: const [
                  ButtonSegment<LogCategory>(
                    value: LogCategory.user,
                    label: Text('User'),
                    icon: Icon(Icons.person_outline),
                  ),
                  ButtonSegment<LogCategory>(
                    value: LogCategory.technical,
                    label: Text('Technical'),
                    icon: Icon(Icons.bug_report_outlined),
                  ),
                ],
                selected: <LogCategory>{_category},
                onSelectionChanged: _onCategoryChanged,
              ),
            ),
            const Divider(height: 1),
            Expanded(
              child: _buildBody(model, items, colorScheme),
            ),
          ],
        );
      },
    );
  }

  Widget _buildBody(LogModel model, List<LogRecord> items,
      ColorScheme colorScheme) {
    final loading = model.isLoadingMore(_category);
    final hasMore = model.hasMore(_category);
    if (items.isEmpty && !loading) {
      return Center(
        child: Text(
          'No log messages yet.',
          style: TextStyle(color: colorScheme.onSurfaceVariant),
        ),
      );
    }
    return ListView.separated(
      controller: _scroll,
      padding: const EdgeInsets.all(AppSpacing.md),
      itemCount: items.length + 1,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (context, index) {
        if (index == items.length) {
          return _Footer(loading: loading, hasMore: hasMore);
        }
        return _LogTile(record: items[index], category: _category);
      },
    );
  }
}

class _Footer extends StatelessWidget {
  final bool loading;
  final bool hasMore;
  const _Footer({required this.loading, required this.hasMore});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    if (loading) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Center(
          child: SizedBox(
            width: 20,
            height: 20,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
        ),
      );
    }
    if (!hasMore) {
      return Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.md),
        child: Center(
          child: Text(
            'No more entries.',
            style: TextStyle(color: colorScheme.onSurfaceVariant),
          ),
        ),
      );
    }
    return const SizedBox.shrink();
  }
}

class _LogTile extends StatefulWidget {
  final LogRecord record;
  final LogCategory category;
  const _LogTile({required this.record, required this.category});

  @override
  State<_LogTile> createState() => _LogTileState();
}

class _LogTileState extends State<_LogTile> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    if (widget.category == LogCategory.user) {
      return _buildUser(context);
    }
    return _buildTechnical(context);
  }

  Widget _buildUser(BuildContext context) {
    final ts = DateTime.fromMillisecondsSinceEpoch(widget.record.timestamp);
    final hhmm =
        '${ts.hour.toString().padLeft(2, '0')}:${ts.minute.toString().padLeft(2, '0')}';
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 48,
            child: Text(
              hhmm,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontFeatures: [FontFeature.tabularFigures()],
                fontSize: 13,
              ),
            ),
          ),
          Expanded(
            child: Text(
              widget.record.message,
              style: const TextStyle(fontSize: 14),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildTechnical(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final ts = DateTime.fromMillisecondsSinceEpoch(widget.record.timestamp);
    final tsStr = ts.toIso8601String();
    final meta = widget.record.meta;
    final hasMeta = meta != null && meta.isNotEmpty;
    return InkWell(
      onTap: hasMeta ? () => setState(() => _expanded = !_expanded) : null,
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _LevelBadge(level: widget.record.level),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    tsStr,
                    style: TextStyle(
                      fontFamily: 'monospace',
                      fontFeatures: const [FontFeature.tabularFigures()],
                      fontSize: 11,
                      color: colorScheme.onSurfaceVariant,
                    ),
                  ),
                ),
                if (hasMeta)
                  Icon(
                    _expanded ? Icons.expand_less : Icons.expand_more,
                    size: 18,
                    color: colorScheme.onSurfaceVariant,
                  ),
              ],
            ),
            const SizedBox(height: 2),
            Text(
              widget.record.message,
              style: const TextStyle(
                fontFamily: 'monospace',
                fontSize: 12,
              ),
            ),
            if (hasMeta && _expanded)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  _prettyJson(meta),
                  style: TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 11,
                    color: colorScheme.onSurfaceVariant,
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }

  String _prettyJson(Map<String, dynamic> meta) {
    final buf = StringBuffer('{\n');
    final keys = meta.keys.toList();
    for (var i = 0; i < keys.length; i++) {
      final k = keys[i];
      buf.write('  "$k": ${_renderJsonValue(meta[k])}');
      if (i < keys.length - 1) buf.write(',');
      buf.write('\n');
    }
    buf.write('}');
    return buf.toString();
  }

  String _renderJsonValue(dynamic v) {
    if (v is String) return '"$v"';
    if (v is num || v is bool || v == null) return '$v';
    if (v is List) return '[${v.map(_renderJsonValue).join(', ')}]';
    if (v is Map) {
      return '{${v.entries.map((e) => '"${e.key}": ${_renderJsonValue(e.value)}').join(', ')}}';
    }
    return '$v';
  }
}

class _LevelBadge extends StatelessWidget {
  final LogLevel level;
  const _LevelBadge({required this.level});

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final (Color bg, Color fg, String label) = switch (level) {
      LogLevel.debug => (
        colorScheme.surfaceContainerHighest,
        colorScheme.onSurfaceVariant,
        'DEBUG',
      ),
      LogLevel.info => (
        colorScheme.secondaryContainer,
        colorScheme.onSecondaryContainer,
        'INFO',
      ),
      LogLevel.warn => (
        colorScheme.tertiaryContainer,
        colorScheme.onTertiaryContainer,
        'WARN',
      ),
      LogLevel.error => (
        colorScheme.errorContainer,
        colorScheme.onErrorContainer,
        'ERROR',
      ),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: fg,
          fontSize: 10,
          fontWeight: FontWeight.w600,
          letterSpacing: 0.5,
        ),
      ),
    );
  }
}

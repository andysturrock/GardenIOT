import 'package:flutter/material.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/theme/app_theme.dart';
import 'package:provider/provider.dart';

class LoggerView extends StatefulWidget {
  const LoggerView({super.key});

  @override
  State<LoggerView> createState() => _LoggerViewState();
}

class _LoggerViewState extends State<LoggerView> {
  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (!_scrollController.hasClients) return;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 250),
        curve: Curves.easeOut,
      );
    });
  }

  @override
  Widget build(BuildContext context) {
    final model = context.read<LogModel>();
    final colorScheme = Theme.of(context).colorScheme;
    return StreamBuilder<List<String>>(
      stream: model.stream,
      initialData: model.messages,
      builder: (context, snapshot) {
        final messages = snapshot.data ?? const <String>[];
        if (messages.isEmpty) {
          return Center(
            child: Text(
              'No log messages yet.',
              style: TextStyle(color: colorScheme.onSurfaceVariant),
            ),
          );
        }
        _scrollToBottom();
        return ListView.separated(
          controller: _scrollController,
          padding: const EdgeInsets.all(AppSpacing.md),
          itemCount: messages.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            return Padding(
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
              child: Text(
                messages[index],
                style: const TextStyle(
                  fontFamily: 'monospace',
                  fontFeatures: [FontFeature.tabularFigures()],
                  fontSize: 12,
                ),
              ),
            );
          },
        );
      },
    );
  }
}

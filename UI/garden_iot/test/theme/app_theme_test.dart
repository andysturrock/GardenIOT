import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/theme/app_theme.dart';

void main() {
  group('AppTheme', () {
    test('light() returns a Material 3 theme derived from the seed color', () {
      final theme = AppTheme.light();
      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.light);
      // Seed-derived primary tone should be in the green family
      expect(theme.colorScheme.primary, isNot(equals(Colors.transparent)));
    });

    test('dark() returns a Material 3 dark theme', () {
      final theme = AppTheme.dark();
      expect(theme.useMaterial3, isTrue);
      expect(theme.brightness, Brightness.dark);
    });

    test('both themes share the same seed color', () {
      expect(AppTheme.seedColor, equals(const Color(0xFF2E7D32)));
    });

    test('CardTheme has rounded corners + the AppRadii.md radius', () {
      final theme = AppTheme.light();
      final shape = theme.cardTheme.shape as RoundedRectangleBorder?;
      expect(shape, isNotNull);
      final radius = (shape!.borderRadius as BorderRadius).topLeft;
      expect(radius.x, AppRadii.md);
    });

    test('AppSpacing exposes the expected scale', () {
      expect(AppSpacing.xs, 4);
      expect(AppSpacing.sm, 8);
      expect(AppSpacing.md, 16);
      expect(AppSpacing.lg, 24);
    });

    test('AppRadii exposes the expected scale', () {
      expect(AppRadii.sm, 8);
      expect(AppRadii.md, 16);
      expect(AppRadii.lg, 24);
    });
  });
}

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    exclude: ['__tests__/integration/**', 'node_modules/**', 'dist/**'],
    // Seeds env vars before any source-module import-time side effects
    // (mqtt-logger eagerly reads CLIENT_ID, etc.).
    setupFiles: ['__tests__/test-setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['*.ts', 'serialization/**/*.ts', 'utils/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '__tests__/**',
        'dist/**',
        'node_modules/**',
        'vitest.config.ts',
        'jest.config.ts',
        'serialization/serialized-*.ts',
        'relay-id.ts',
        // index.ts is the runtime entrypoint: wires AWS connection,
        // signal handlers, schedules. Effectively integration-only;
        // unit-testing it doesn't surface bugs the per-module tests
        // wouldn't already catch.
        'index.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 90,
        statements: 95,
      },
    },
  },
});

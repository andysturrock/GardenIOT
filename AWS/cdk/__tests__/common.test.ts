import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { getEnv } from '../lib/common';

describe('getEnv', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.MY_TEST_VAR;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  test('returns the value when the env var is set', () => {
    process.env.MY_TEST_VAR = 'hello';
    expect(getEnv('MY_TEST_VAR')).toBe('hello');
  });

  test('returns undefined when an optional env var is missing', () => {
    expect(getEnv('MY_TEST_VAR', true)).toBeUndefined();
  });

  test('throws when a required env var is missing (optional defaults to false)', () => {
    expect(() => getEnv('MY_TEST_VAR', false)).toThrow(/MY_TEST_VAR/);
  });

  test('throws when no optional flag is passed and the var is missing', () => {
    expect(() => getEnv('MY_TEST_VAR')).toThrow(/MY_TEST_VAR/);
  });
});

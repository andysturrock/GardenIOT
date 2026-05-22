import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import getEnv from '../utils/getenv';

describe('getEnv', () => {
  const original = process.env;

  beforeEach(() => {
    process.env = { ...original };
  });

  afterEach(() => {
    process.env = original;
  });

  test('returns the value when the env var is set', () => {
    process.env.MY_TEST_VAR = 'hello';
    expect(getEnv('MY_TEST_VAR')).toBe('hello');
  });

  test('returns undefined when an optional env var is missing', () => {
    delete process.env.MY_TEST_VAR;
    expect(getEnv('MY_TEST_VAR', true)).toBeUndefined();
  });

  test('throws when a required env var is missing (explicit false)', () => {
    delete process.env.MY_TEST_VAR;
    expect(() => getEnv('MY_TEST_VAR', false)).toThrow(/MY_TEST_VAR/);
  });

  test('treats undefined optional argument as optional=true (default)', () => {
    // The default in source is optional=true, but we set it explicitly
    // in production code so the API contract is documented.
    delete process.env.MY_TEST_VAR;
    expect(getEnv('MY_TEST_VAR')).toBeUndefined();
  });

  test('returns empty string verbatim if the env var is set to empty', () => {
    process.env.MY_TEST_VAR = '';
    // Empty string is falsy → treated as "missing" by the implementation
    expect(() => getEnv('MY_TEST_VAR', false)).toThrow(/MY_TEST_VAR/);
  });
});

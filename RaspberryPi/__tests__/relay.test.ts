import { describe, test, expect, beforeEach } from 'vitest';
import Relay from '../relay';
import { MockGPIO } from './mock-gpio';

describe('Relay', () => {
  beforeEach(() => {
    MockGPIO.reset();
  });

  describe('constructor', () => {
    test('RELAY1 maps to pin 35 (BOARD numbering) with name RELAY1', () => {
      const r = new Relay(Relay.RELAY1);
      expect(r.id).toBe(35);
      expect(r.name).toBe('RELAY1');
    });

    test('RELAY2 maps to pin 33', () => {
      const r = new Relay(Relay.RELAY2);
      expect(r.id).toBe(33);
      expect(r.name).toBe('RELAY2');
    });

    test('RELAY3 maps to pin 31', () => {
      const r = new Relay(Relay.RELAY3);
      expect(r.id).toBe(31);
      expect(r.name).toBe('RELAY3');
    });

    test('RELAY4 maps to pin 29', () => {
      const r = new Relay(Relay.RELAY4);
      expect(r.id).toBe(29);
      expect(r.name).toBe('RELAY4');
    });

    test('throws RangeError on an unknown RelayId', () => {
      expect(() => new Relay(99 as never)).toThrow(RangeError);
    });
  });

  describe('init()', () => {
    test('configures the pin as OUTPUT then writes LOW (safe state)', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.init();

      expect(MockGPIO.setups).toContainEqual({ pin: 35, dir: MockGPIO.DIR_OUT });
      expect(MockGPIO.lastValue(35)).toBe(false);
    });
  });

  describe('open() / close()', () => {
    test('open writes GPIO HIGH', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      expect(MockGPIO.lastValue(35)).toBe(true);
    });

    test('close writes GPIO LOW', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      await r.close();
      expect(MockGPIO.lastValue(35)).toBe(false);
    });
  });

  describe('dispose()', () => {
    test('writes GPIO LOW (closes the relay)', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      await r.dispose();
      expect(MockGPIO.lastValue(35)).toBe(false);
    });
  });

});

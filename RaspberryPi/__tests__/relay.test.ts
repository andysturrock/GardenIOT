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
      expect(r.isOpen).toBe(false);
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
      expect(r.isOpen).toBe(false);
    });

    test('does not fire onActualStateChange (already in LOW position)', async () => {
      class Spy extends Relay {
        public calls: string[] = [];
        protected async onActualStateChange(state: 'open' | 'closed'): Promise<void> {
          this.calls.push(state);
        }
      }
      const r = new Spy(Relay.RELAY1);
      await r.init();
      expect(r.calls).toEqual([]);
    });
  });

  describe('open() / close()', () => {
    test('open writes GPIO HIGH and flips isOpen true', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      expect(MockGPIO.lastValue(35)).toBe(true);
      expect(r.isOpen).toBe(true);
    });

    test('close writes GPIO LOW and flips isOpen false', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      await r.close();
      expect(MockGPIO.lastValue(35)).toBe(false);
      expect(r.isOpen).toBe(false);
    });

    test('open() is idempotent — no second GPIO write when already open', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      MockGPIO.reset();
      await r.open();
      expect(MockGPIO.writes).toEqual([]);
    });

    test('close() is idempotent — no GPIO write when already closed', async () => {
      const r = new Relay(Relay.RELAY1);
      // Initial state is closed; no need to call close() first.
      await r.close();
      expect(MockGPIO.writes).toEqual([]);
    });

    test('onActualStateChange fires once per true edge', async () => {
      class Spy extends Relay {
        public calls: ('open' | 'closed')[] = [];
        protected async onActualStateChange(state: 'open' | 'closed'): Promise<void> {
          this.calls.push(state);
        }
      }
      const r = new Spy(Relay.RELAY1);
      await r.init();
      await r.open();
      await r.open(); // dedup
      await r.close();
      await r.close(); // dedup
      expect(r.calls).toEqual(['open', 'closed']);
    });

    test('onActualStateChange is awaited by open()', async () => {
      const order: string[] = [];
      class Spy extends Relay {
        protected async onActualStateChange(_state: 'open' | 'closed'): Promise<void> {
          order.push('hook-start');
          await new Promise((r) => setTimeout(r, 0));
          order.push('hook-end');
        }
      }
      const r = new Spy(Relay.RELAY1);
      await r.open();
      order.push('after-open');
      expect(order).toEqual(['hook-start', 'hook-end', 'after-open']);
    });
  });

  describe('dispose()', () => {
    test('writes GPIO LOW (closes the relay) when open', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.open();
      await r.dispose();
      expect(MockGPIO.lastValue(35)).toBe(false);
    });

    test('does nothing if already closed (dedup via _isOpen)', async () => {
      const r = new Relay(Relay.RELAY1);
      await r.init();
      MockGPIO.reset();
      await r.dispose();
      expect(MockGPIO.writes).toEqual([]);
    });
  });
});

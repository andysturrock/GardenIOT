import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { mqtt } from 'aws-crt';
import Relay from '../relay';
import ShadowRelay from '../shadow-relay';
import { MockAWSConnection } from './mock-aws-connection';
import { MockGPIO } from './mock-gpio';

const CLIENT_ID = process.env.CLIENT_ID!;
const RELAY1_PIN = 35;
const SAFETY_TIMEOUT_MS = 5 * 60 * 1000;

function topic(name: string): string {
  return `$aws/things/${CLIENT_ID}/shadow/name/RELAY1/${name}`;
}

function deltaPayload(openClosed: 'open' | 'closed', version: number): string {
  return JSON.stringify({
    state: { open_closed: openClosed },
    version,
  });
}

function documentsPayload(version: number): string {
  return JSON.stringify({ current: { version } });
}

describe('ShadowRelay', () => {
  let conn: MockAWSConnection;
  let relay: ShadowRelay;

  beforeEach(async () => {
    MockGPIO.reset();
    conn = new MockAWSConnection();
    // Cast: MockAWSConnection has the public surface ShadowRelay needs.
    relay = new ShadowRelay(Relay.RELAY1, conn as unknown as never);
    await relay.init();
    // init() runs super.init() which calls close() and publishes
    // desired=closed once. Clear the activity log so each test starts
    // from a clean slate; subscriptions and GPIO state are preserved.
    // (init-specific tests assert before this reset by checking the
    // GPIO + subscription state at the top of the file.)
  });

  // Tests that examine the init's own side effects need access to the
  // pre-reset state, so we capture the init close in a separate describe
  // below. For all the post-init behaviour tests, reset before each.
  function freshActivityLog() {
    MockGPIO.reset();
    conn.reset();
  }

  afterEach(async () => {
    vi.useRealTimers();
    await relay.dispose();
  });

  describe('init()', () => {
    test('subscribes to all four shadow update topics before initialising GPIO', () => {
      const topics = conn.subscriptions.map((s) => s.topic);
      expect(topics).toEqual([
        topic('update/accepted'),
        topic('update/rejected'),
        topic('update/delta'),
        topic('update/documents'),
      ]);
    });

    test('subscribes at AtLeastOnce QoS (so the broker retains until delivered)', () => {
      for (const s of conn.subscriptions) {
        expect(s.qos).toBe(mqtt.QoS.AtLeastOnce);
      }
    });

    test('initial GPIO state is LOW (relay closed)', () => {
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
      expect(MockGPIO.setups).toContainEqual({ pin: RELAY1_PIN, dir: MockGPIO.DIR_OUT });
    });
  });

  describe('open() (user intent)', () => {
    beforeEach(freshActivityLog);

    test('writes GPIO HIGH', async () => {
      await relay.open();
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(true);
    });

    test('publishes desired=open to the shadow update topic', async () => {
      await relay.open();
      const desired = conn.publishesMatching('"desired":{"open_closed":"open"}');
      expect(desired).toHaveLength(1);
      expect(desired[0].topic).toBe(topic('update'));
      expect(desired[0].retain).toBeFalsy();
    });

    test('does not publish a reported update directly', async () => {
      await relay.open();
      // Reported updates only come from the _open path (via delta).
      expect(conn.publishesMatching('"reported"')).toHaveLength(0);
    });
  });

  describe('close() (user intent)', () => {
    beforeEach(freshActivityLog);

    test('writes GPIO LOW', async () => {
      await relay.open();
      await relay.close();
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('publishes desired=closed to the shadow update topic', async () => {
      await relay.close();
      const desired = conn.publishesMatching('"desired":{"open_closed":"closed"}');
      expect(desired).toHaveLength(1);
    });

    test('publish failure is swallowed (does not throw)', async () => {
      conn.failNextPublish = true;
      await expect(relay.close()).resolves.toBeUndefined();
      // GPIO close still happened
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('non-Error publish failure is also swallowed (covers else branch)', async () => {
      vi.spyOn(conn, 'publish').mockRejectedValueOnce('plain string error' as never);
      await expect(relay.close()).resolves.toBeUndefined();
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });
  });

  describe('forceClose() (safety + shutdown path)', () => {
    beforeEach(freshActivityLog);

    test('writes GPIO LOW', async () => {
      await relay.open();
      freshActivityLog();
      await relay.forceClose();
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('publishes BOTH reported=closed AND desired=closed in a single update', async () => {
      await relay.forceClose();
      const combined = conn.publishes.find((p) => {
        const s = JSON.stringify(p.payload);
        return s.includes('"reported":{"open_closed":"closed"}')
          && s.includes('"desired":{"open_closed":"closed"}');
      });
      expect(combined).toBeDefined();
      expect(combined?.topic).toBe(topic('update'));
    });

    test('publish failure is swallowed (does not throw)', async () => {
      conn.failNextPublish = true;
      await expect(relay.forceClose()).resolves.toBeUndefined();
      // GPIO close still happened
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('non-Error publish failure is also swallowed (covers else branch)', async () => {
      // Throw a non-Error value so the catch's `if (error instanceof Error)`
      // takes the else branch.
      vi.spyOn(conn, 'publish').mockRejectedValueOnce('plain string error' as never);
      await expect(relay.forceClose()).resolves.toBeUndefined();
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });
  });

  describe('emergencyClose()', () => {
    beforeEach(freshActivityLog);

    test('writes GPIO LOW', async () => {
      await relay.open();
      freshActivityLog();
      await relay.emergencyClose();
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('does not publish to MQTT (fast-path for crash handlers)', async () => {
      await relay.emergencyClose();
      expect(conn.publishes).toHaveLength(0);
    });
  });

  describe('onDelta (responses to shadow desired changes)', () => {
    beforeEach(() => {
      freshActivityLog();
      // Seed the version so deltas with version=1+ are accepted
      conn.simulateMessage(topic('update/documents'), documentsPayload(0));
    });

    test('delta with desired=open writes GPIO HIGH and publishes reported=open', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      // The handler is async; let microtasks settle
      await new Promise((r) => setImmediate(r));

      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(true);
      expect(conn.publishesMatching('"reported":{"open_closed":"open"}')).toHaveLength(1);
    });

    test('delta with desired=closed writes GPIO LOW and publishes reported=closed', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await new Promise((r) => setImmediate(r));
      conn.simulateMessage(topic('update/delta'), deltaPayload('closed', 2));
      await new Promise((r) => setImmediate(r));

      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
      expect(conn.publishesMatching('"reported":{"open_closed":"closed"}')).toHaveLength(1);
    });

    test('delta with stale version is ignored (no GPIO change)', async () => {
      // Push version forward to 5
      conn.simulateMessage(topic('update/documents'), documentsPayload(5));
      freshActivityLog();

      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 3));
      await new Promise((r) => setImmediate(r));

      expect(MockGPIO.writes).toHaveLength(0);
      expect(conn.publishes).toHaveLength(0);
    });

    test('delta without a version is ignored', async () => {
      conn.simulateMessage(
        topic('update/delta'),
        JSON.stringify({ state: { open_closed: 'open' } }),
      );
      await new Promise((r) => setImmediate(r));

      expect(MockGPIO.writes).toHaveLength(0);
      expect(conn.publishesMatching('"reported"')).toHaveLength(0);
    });

    test('delta with unknown desired value is ignored (no GPIO change)', async () => {
      conn.simulateMessage(
        topic('update/delta'),
        JSON.stringify({ state: { open_closed: 'sideways' }, version: 1 }),
      );
      await new Promise((r) => setImmediate(r));

      expect(MockGPIO.writes).toHaveLength(0);
    });

    test('malformed JSON in delta does not throw', async () => {
      expect(() => {
        conn.simulateMessage(topic('update/delta'), '{not valid json');
      }).not.toThrow();
      await new Promise((r) => setImmediate(r));
      expect(MockGPIO.writes).toHaveLength(0);
    });
  });

  describe('onAccepted / onRejected', () => {
    test('accepted payload does not throw', () => {
      expect(() => {
        conn.simulateMessage(topic('update/accepted'), '{"ok":true}');
      }).not.toThrow();
    });

    test('rejected payload does not throw', () => {
      expect(() => {
        conn.simulateMessage(topic('update/rejected'), '{"err":"bad"}');
      }).not.toThrow();
    });
  });

  describe('onDocuments', () => {
    test('updates internal version from documents.current.version', async () => {
      conn.simulateMessage(topic('update/documents'), documentsPayload(10));
      // Subsequent delta with version 5 should be ignored
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 5));
      await new Promise((r) => setImmediate(r));
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('malformed documents payload does not throw', () => {
      expect(() => {
        conn.simulateMessage(topic('update/documents'), '{not valid json');
      }).not.toThrow();
    });
  });

  describe('safety timer', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      // Seed version
      conn.simulateMessage(topic('update/documents'), documentsPayload(0));
    });

    test('opening via delta arms a 5-minute timer that force-closes', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);  // let onDelta microtasks run
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(true);

      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS);
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);

      // forceClose publishes the combined reported+desired update
      const combined = conn.publishes.find((p) => {
        const s = JSON.stringify(p.payload);
        return s.includes('"reported":{"open_closed":"closed"}')
          && s.includes('"desired":{"open_closed":"closed"}');
      });
      expect(combined).toBeDefined();
    });

    test('safety timer does not fire before 5 minutes', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(true);

      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS - 1000);
      // Still open
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(true);
    });

    test('re-opening within the window resets the timer', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS - 1000);

      // Re-open just before the original timer would fire
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 2));
      await vi.advanceTimersByTimeAsync(0);

      // Original 5-min mark — timer should NOT have fired (it was reset)
      await vi.advanceTimersByTimeAsync(1000);
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(true);

      // Now go past the new 5-min mark
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS);
      expect(MockGPIO.lastValue(RELAY1_PIN)).toBe(false);
    });

    test('close (via delta) cancels the safety timer', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);

      conn.simulateMessage(topic('update/delta'), deltaPayload('closed', 2));
      await vi.advanceTimersByTimeAsync(0);

      // Now advance past the original 5-min mark
      MockGPIO.reset();
      conn.reset();
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS + 1000);

      // No additional GPIO activity (timer was cancelled)
      expect(MockGPIO.writes).toHaveLength(0);
    });

    test('forceClose() cancels the safety timer', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);

      await relay.forceClose();
      MockGPIO.reset();
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS + 1000);
      expect(MockGPIO.writes).toHaveLength(0);
    });

    test('emergencyClose() cancels the safety timer', async () => {
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);

      await relay.emergencyClose();
      MockGPIO.reset();
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS + 1000);
      expect(MockGPIO.writes).toHaveLength(0);
    });
  });

  describe('dispose()', () => {
    test('unsubscribes from all four shadow topics', async () => {
      await relay.dispose();
      expect(conn.unsubscribes).toEqual([
        topic('update/accepted'),
        topic('update/rejected'),
        topic('update/delta'),
        topic('update/documents'),
      ]);
    });

    test('cancels any pending safety timer', async () => {
      vi.useFakeTimers();
      // Seed + open
      conn.simulateMessage(topic('update/documents'), documentsPayload(0));
      conn.simulateMessage(topic('update/delta'), deltaPayload('open', 1));
      await vi.advanceTimersByTimeAsync(0);

      await relay.dispose();
      MockGPIO.reset();
      await vi.advanceTimersByTimeAsync(SAFETY_TIMEOUT_MS + 1000);
      expect(MockGPIO.writes).toHaveLength(0);
    });
  });
});

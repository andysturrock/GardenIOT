import { describe, test, expect, beforeEach, vi } from 'vitest';
import { mqtt } from 'aws-crt';
import ConfigShadow from '../config-shadow';
import { defaultGardenConfig, GardenConfig, SCHEMA_VERSION } from '../serialization/garden-config';
import { MockAWSConnection } from './mock-aws-connection';

const CLIENT_ID = process.env.CLIENT_ID!;
const BASE = `$aws/things/${CLIENT_ID}/shadow/name/config`;

const TOPICS = {
  get: `${BASE}/get`,
  getAccepted: `${BASE}/get/accepted`,
  getRejected: `${BASE}/get/rejected`,
  update: `${BASE}/update`,
  updateAccepted: `${BASE}/update/accepted`,
  updateRejected: `${BASE}/update/rejected`,
  delta: `${BASE}/update/delta`,
  documents: `${BASE}/update/documents`,
};

async function settle(): Promise<void> {
  await new Promise((r) => setImmediate(r));
}

describe('ConfigShadow', () => {
  let conn: MockAWSConnection;
  let onChanged: ReturnType<typeof vi.fn>;
  let shadow: ConfigShadow;

  beforeEach(async () => {
    conn = new MockAWSConnection();
    onChanged = vi.fn();
    shadow = new ConfigShadow(conn as unknown as never, onChanged);
    await shadow.init();
  });

  describe('init()', () => {
    test('subscribes to all six config-shadow topics', () => {
      expect(conn.subscriptions.map((s) => s.topic)).toEqual([
        TOPICS.getAccepted,
        TOPICS.getRejected,
        TOPICS.updateAccepted,
        TOPICS.updateRejected,
        TOPICS.delta,
        TOPICS.documents,
      ]);
      for (const s of conn.subscriptions) expect(s.qos).toBe(mqtt.QoS.AtLeastOnce);
    });

    test('publishes a get to fetch initial state', () => {
      const gets = conn.publishes.filter((p) => p.topic === TOPICS.get);
      expect(gets).toHaveLength(1);
    });
  });

  describe('get/accepted with reported state', () => {
    test('applies the reported config, calls onChanged, and publishes reported back', async () => {
      conn.reset();
      const config = defaultGardenConfig();
      conn.simulateMessage(TOPICS.getAccepted, JSON.stringify({
        state: { reported: config, desired: config },
        version: 5,
      }));
      await settle();

      expect(onChanged).toHaveBeenCalledOnce();
      expect(onChanged.mock.calls[0][0]).toEqual(config);
      const reportedPub = conn.publishes.find((p) => p.topic === TOPICS.update);
      expect(reportedPub).toBeDefined();
      const body = JSON.parse(String(reportedPub!.payload));
      expect(body.state.reported).toEqual(config);
      expect(body.state.desired).toBeUndefined();
      expect(shadow.config).toEqual(config);
    });

    test('reads from reported when desired is absent', async () => {
      conn.reset();
      const config = defaultGardenConfig();
      conn.simulateMessage(TOPICS.getAccepted, JSON.stringify({
        state: { reported: config },
        version: 1,
      }));
      await settle();
      expect(onChanged).toHaveBeenCalledOnce();
    });

    test('seeds when get/accepted has empty state', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.getAccepted, JSON.stringify({ state: {} }));
      await settle();
      const updates = conn.publishes.filter((p) => p.topic === TOPICS.update);
      expect(updates).toHaveLength(1);
      const body = JSON.parse(String(updates[0].payload));
      expect(body.state.reported).toEqual(defaultGardenConfig());
      expect(body.state.desired).toEqual(defaultGardenConfig());
    });

    test('non-object payload is ignored', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.getAccepted, '"not-an-object"');
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
      expect(conn.publishes).toHaveLength(0);
    });

    test('malformed JSON is logged and ignored', async () => {
      conn.reset();
      expect(() => conn.simulateMessage(TOPICS.getAccepted, '{not json'))
        .not.toThrow();
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('invalid config payload logs but does not publish reported', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.getAccepted, JSON.stringify({
        state: { reported: { version: 99, beds: {}, jobs: [], tz: 'UTC' } },
      }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
      expect(conn.publishes.filter((p) => p.topic === TOPICS.update)).toHaveLength(0);
    });
  });

  describe('get/rejected', () => {
    test('code 404 triggers seed publish', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.getRejected, JSON.stringify({ code: 404, message: 'No shadow exists' }));
      await settle();
      const updates = conn.publishes.filter((p) => p.topic === TOPICS.update);
      expect(updates).toHaveLength(1);
      const body = JSON.parse(String(updates[0].payload));
      expect(body.state.reported).toEqual(defaultGardenConfig());
      expect(body.state.desired).toEqual(defaultGardenConfig());
    });

    test('non-404 codes are logged and do not seed', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.getRejected, JSON.stringify({ code: 401, message: 'forbidden' }));
      await settle();
      expect(conn.publishes.filter((p) => p.topic === TOPICS.update)).toHaveLength(0);
    });

    test('malformed JSON is logged without seeding', async () => {
      conn.reset();
      expect(() => conn.simulateMessage(TOPICS.getRejected, '{not json'))
        .not.toThrow();
      await settle();
      expect(conn.publishes.filter((p) => p.topic === TOPICS.update)).toHaveLength(0);
    });
  });

  describe('update/delta', () => {
    test('applies a fresh delta and publishes reported confirmation', async () => {
      conn.reset();
      const config: GardenConfig = {
        version: SCHEMA_VERSION,
        beds: { '1': { name: 'A' }, '2': { name: 'B' }, '3': { name: 'C' }, '4': { name: 'D' } },
        jobs: [],
        tz: 'UTC',
      };
      conn.simulateMessage(TOPICS.delta, JSON.stringify({ state: config, version: 7 }));
      await settle();
      expect(onChanged).toHaveBeenCalledOnce();
      expect(onChanged.mock.calls[0][0]).toEqual(config);
      const reportedPub = conn.publishes.find((p) => p.topic === TOPICS.update);
      const body = JSON.parse(String(reportedPub!.payload));
      expect(body.state.reported).toEqual(config);
    });

    test('stale delta (version below current) is ignored', async () => {
      conn.reset();
      // Bump the shadow's tracked version via documents
      conn.simulateMessage(TOPICS.documents, JSON.stringify({ current: { version: 10 } }));
      await settle();
      conn.simulateMessage(TOPICS.delta, JSON.stringify({
        state: defaultGardenConfig(),
        version: 3,
      }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('delta without a version is ignored', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.delta, JSON.stringify({ state: defaultGardenConfig() }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('delta with empty state is ignored', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.delta, JSON.stringify({ version: 5 }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('non-object delta payload is ignored', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.delta, '[]');
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('invalid config delta logs and does not call onChanged', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.delta, JSON.stringify({
        state: { version: 1, beds: {}, jobs: [{ id: 'bad', days: [9], hour: 0, minute: 0, duration_s: 10, relays: [1] }], tz: 'UTC' },
        version: 5,
      }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });
  });

  describe('update/documents', () => {
    test('updates internal version (subsequent stale delta ignored)', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.documents, JSON.stringify({ current: { version: 100 } }));
      conn.simulateMessage(TOPICS.delta, JSON.stringify({
        state: defaultGardenConfig(),
        version: 50,
      }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('malformed documents payload does not throw', () => {
      conn.reset();
      expect(() => conn.simulateMessage(TOPICS.documents, '{not json'))
        .not.toThrow();
    });

    test('documents without current.version is tolerated', async () => {
      conn.reset();
      expect(() => conn.simulateMessage(TOPICS.documents, JSON.stringify({ current: {} })))
        .not.toThrow();
    });
  });

  describe('update/accepted and update/rejected', () => {
    test('accepted with version bumps internal version', async () => {
      conn.reset();
      conn.simulateMessage(TOPICS.updateAccepted, JSON.stringify({ version: 42 }));
      conn.simulateMessage(TOPICS.delta, JSON.stringify({
        state: defaultGardenConfig(),
        version: 10,
      }));
      await settle();
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('rejected payload does not throw', () => {
      expect(() => conn.simulateMessage(TOPICS.updateRejected, JSON.stringify({ code: 400 })))
        .not.toThrow();
    });
  });

  describe('publish failures are swallowed', () => {
    test('publishGet failure is logged', async () => {
      const fresh = new MockAWSConnection();
      // Make publish reject
      vi.spyOn(fresh, 'publish').mockRejectedValueOnce(new Error('mqtt down') as never);
      const s = new ConfigShadow(fresh as unknown as never, vi.fn());
      await expect(s.init()).resolves.toBeUndefined();
    });

    test('seed publish failure is logged', async () => {
      conn.reset();
      conn.failNextPublish = true;
      conn.simulateMessage(TOPICS.getRejected, JSON.stringify({ code: 404 }));
      await settle();
      // No throw, no onChanged
      expect(onChanged).not.toHaveBeenCalled();
    });

    test('reported publish failure is logged', async () => {
      conn.reset();
      conn.failNextPublish = true;
      conn.simulateMessage(TOPICS.getAccepted, JSON.stringify({
        state: { reported: defaultGardenConfig() },
        version: 1,
      }));
      await settle();
      // onChanged still fired even though the reported publish failed
      expect(onChanged).toHaveBeenCalledOnce();
    });

    test('onChanged callback throws are logged but not propagated', async () => {
      const fresh = new MockAWSConnection();
      const throwing = vi.fn().mockImplementation(() => { throw new Error('callback fail'); });
      const s = new ConfigShadow(fresh as unknown as never, throwing);
      await s.init();
      fresh.reset();
      fresh.simulateMessage(TOPICS.getAccepted, JSON.stringify({
        state: { reported: defaultGardenConfig() },
        version: 1,
      }));
      await settle();
      expect(throwing).toHaveBeenCalledOnce();
    });
  });

  describe('dispose()', () => {
    test('unsubscribes from all six topics', async () => {
      await shadow.dispose();
      expect(conn.unsubscribes).toEqual([
        TOPICS.getAccepted,
        TOPICS.getRejected,
        TOPICS.updateAccepted,
        TOPICS.updateRejected,
        TOPICS.delta,
        TOPICS.documents,
      ]);
    });
  });

  describe('config getter', () => {
    test('returns null until first successful apply', () => {
      const fresh = new ConfigShadow(new MockAWSConnection() as unknown as never, vi.fn());
      expect(fresh.config).toBeNull();
    });
  });
});

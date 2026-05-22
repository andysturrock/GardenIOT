import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the entire aws-crt module so we don't need real certs or a live
// broker. We export the same shape the source uses (iot + mqtt),
// plus __mockConnection / __mockBuilder hooks for tests to inspect
// what aws-connection.ts did to them.
vi.mock('aws-crt', () => {
  const onSpy = vi.fn();
  const mockConnection = {
    on: onSpy,
    connect: vi.fn(async () => ({ session_present: false })),
    disconnect: vi.fn(async () => undefined),
    publish: vi.fn(async () => ({ packet_id: 1 })),
    subscribe: vi.fn(async () => ({ packet_id: 1, topic: 't', qos: 1 })),
    unsubscribe: vi.fn(async () => ({ packet_id: 1 })),
    _handlers: new Map<string, ((...args: unknown[]) => void)[]>(),
  };
  // Capture handlers so tests can fire events
  onSpy.mockImplementation((name: string, cb: (...args: unknown[]) => void) => {
    if (!mockConnection._handlers.has(name)) {
      mockConnection._handlers.set(name, []);
    }
    mockConnection._handlers.get(name)!.push(cb);
    return mockConnection;
  });

  const mockBuilder = {
    with_certificate_authority_from_path: vi.fn().mockReturnThis(),
    with_clean_session: vi.fn().mockReturnThis(),
    with_client_id: vi.fn().mockReturnThis(),
    with_endpoint: vi.fn().mockReturnThis(),
    with_will: vi.fn().mockReturnThis(),
    build: vi.fn(() => ({ /* config */ })),
  };

  const mockClient = {
    new_connection: vi.fn(() => mockConnection),
  };

  const willCalls: Array<{ topic: string; qos: number; payload: unknown; retain: boolean }> = [];

  class MqttWill {
    constructor(public topic: string, public qos: number, public payload: unknown, public retain: boolean) {
      willCalls.push({ topic, qos, payload, retain });
    }
  }

  return {
    iot: {
      AwsIotMqttConnectionConfigBuilder: {
        new_mtls_builder_from_path: vi.fn(() => mockBuilder),
      },
    },
    mqtt: {
      MqttClient: vi.fn(() => mockClient),
      MqttWill,
      QoS: { AtMostOnce: 0, AtLeastOnce: 1 },
    },
    __mockConnection: mockConnection,
    __mockBuilder: mockBuilder,
    __mockClient: mockClient,
    __willCalls: willCalls,
  };
});

// Import AFTER vi.mock so the mocked aws-crt is in effect
const awsCrt = await import('aws-crt');
const AWSConnection = (await import('../aws-connection')).default;

const mockConn = (awsCrt as any).__mockConnection;
const mockBuilder = (awsCrt as any).__mockBuilder;
const willCalls = (awsCrt as any).__willCalls as Array<{ topic: string; payload: unknown; retain: boolean }>;

describe('AWSConnection', () => {
  beforeEach(() => {
    // Clear call logs but keep the mock structure
    mockConn.on.mockClear();
    mockConn.connect.mockClear();
    mockConn.disconnect.mockClear();
    mockConn.publish.mockClear();
    mockConn.subscribe.mockClear();
    mockConn.unsubscribe.mockClear();
    mockConn._handlers.clear();
    mockBuilder.with_certificate_authority_from_path.mockClear();
    mockBuilder.with_clean_session.mockClear();
    mockBuilder.with_client_id.mockClear();
    mockBuilder.with_endpoint.mockClear();
    mockBuilder.with_will.mockClear();
    mockBuilder.build.mockClear();
    willCalls.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor + LWT', () => {
    test('configures MQTT connection from env vars', () => {
      // eslint-disable-next-line no-new
      new AWSConnection();
      expect(mockBuilder.with_clean_session).toHaveBeenCalledWith(false);
      expect(mockBuilder.with_client_id).toHaveBeenCalledWith(process.env.CLIENT_ID);
      expect(mockBuilder.with_endpoint).toHaveBeenCalledWith(process.env.ENDPOINT);
      expect(mockBuilder.with_certificate_authority_from_path).toHaveBeenCalledWith(undefined, process.env.CAFILE);
      expect(mockBuilder.build).toHaveBeenCalledOnce();
    });

    test('pre-registers a Last Will & Testament for the status topic', () => {
      // eslint-disable-next-line no-new
      new AWSConnection();
      expect(willCalls).toHaveLength(1);
      const will = willCalls[0];
      expect(will.topic).toBe(`${process.env.CLIENT_ID}/status`);
      expect(will.retain).toBe(true);
      expect(JSON.parse(String(will.payload))).toEqual({
        online: false,
        reason: 'lwt',
      });
    });

    test('statusTopic getter returns ${CLIENT_ID}/status', () => {
      const c = new AWSConnection();
      expect(c.statusTopic).toBe(`${process.env.CLIENT_ID}/status`);
    });
  });

  describe('connect()', () => {
    test('binds connect/disconnect/interrupt/resume/error event handlers', async () => {
      const c = new AWSConnection();
      await c.connect();
      const names = Array.from(mockConn._handlers.keys());
      expect(names).toEqual(expect.arrayContaining(['connect', 'disconnect', 'interrupt', 'resume', 'error']));
    });

    test('calls connection.connect()', async () => {
      const c = new AWSConnection();
      await c.connect();
      expect(mockConn.connect).toHaveBeenCalledOnce();
    });

    test('event handlers log without throwing when fired', async () => {
      const c = new AWSConnection();
      await c.connect();
      for (const name of ['connect', 'disconnect', 'interrupt', 'resume', 'error']) {
        const handlers = mockConn._handlers.get(name) ?? [];
        for (const h of handlers) {
          expect(() => h(new Error('boom'), 0, false)).not.toThrow();
        }
      }
    });
  });

  describe('disconnect()', () => {
    test('awaits the underlying connection.disconnect()', async () => {
      const c = new AWSConnection();
      await c.connect();
      await c.disconnect();
      expect(mockConn.disconnect).toHaveBeenCalledOnce();
    });

    test('is a no-op if connect() was never called', async () => {
      const c = new AWSConnection();
      await c.disconnect();
      expect(mockConn.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('publish / subscribe / unsubscribe', () => {
    test('publish forwards to connection.publish', async () => {
      const c = new AWSConnection();
      await c.connect();
      await c.publish('t', 'p', 1 as any, true);
      expect(mockConn.publish).toHaveBeenCalledWith('t', 'p', 1, true);
    });

    test('subscribe forwards to connection.subscribe', async () => {
      const c = new AWSConnection();
      await c.connect();
      const handler = () => undefined;
      await c.subscribe('t', 1 as any, handler);
      expect(mockConn.subscribe).toHaveBeenCalledWith('t', 1, handler);
    });

    test('unsubscribe forwards to connection.unsubscribe', async () => {
      const c = new AWSConnection();
      await c.connect();
      await c.unsubscribe('t');
      expect(mockConn.unsubscribe).toHaveBeenCalledWith('t');
    });

    test('publish before connect returns undefined (no crash)', async () => {
      const c = new AWSConnection();
      await expect(c.publish('t', 'p', 1 as any)).resolves.toBeUndefined();
    });

    test('subscribe before connect returns undefined (no crash)', async () => {
      const c = new AWSConnection();
      await expect(c.subscribe('t', 1 as any)).resolves.toBeUndefined();
    });

    test('unsubscribe before connect returns undefined (no crash)', async () => {
      const c = new AWSConnection();
      await expect(c.unsubscribe('t')).resolves.toBeUndefined();
    });
  });

  describe('publishOnline()', () => {
    test('publishes {online:true, timestamp, uptime_seconds} retained at AtLeastOnce', async () => {
      const c = new AWSConnection();
      await c.connect();
      mockConn.publish.mockClear();

      const before = Date.now();
      await c.publishOnline();
      const after = Date.now();

      expect(mockConn.publish).toHaveBeenCalledOnce();
      const [topic, payload, qos, retain] = mockConn.publish.mock.calls[0];
      expect(topic).toBe(`${process.env.CLIENT_ID}/status`);
      expect(qos).toBe(1);  // AtLeastOnce
      expect(retain).toBe(true);
      const decoded = JSON.parse(payload);
      expect(decoded.online).toBe(true);
      expect(decoded.timestamp).toBeGreaterThanOrEqual(before);
      expect(decoded.timestamp).toBeLessThanOrEqual(after);
      expect(typeof decoded.uptime_seconds).toBe('number');
    });
  });

  describe('publishOffline()', () => {
    test('publishes {online:false, reason:"graceful"} retained at AtLeastOnce', async () => {
      const c = new AWSConnection();
      await c.connect();
      mockConn.publish.mockClear();

      await c.publishOffline();

      expect(mockConn.publish).toHaveBeenCalledOnce();
      const [topic, payload, qos, retain] = mockConn.publish.mock.calls[0];
      expect(topic).toBe(`${process.env.CLIENT_ID}/status`);
      expect(qos).toBe(1);
      expect(retain).toBe(true);
      expect(JSON.parse(payload)).toEqual({
        online: false,
        reason: 'graceful',
      });
    });
  });
});

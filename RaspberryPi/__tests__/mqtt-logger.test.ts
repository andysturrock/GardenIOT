import { describe, test, expect, beforeEach } from 'vitest';
import { mqtt } from 'aws-crt';
import { MQTTLogger } from '../mqtt-logger';
import { MockAWSConnection } from './mock-aws-connection';

const CLIENT_ID = process.env.CLIENT_ID!;

async function flushAwsTransport(): Promise<void> {
  // tslog attachTransport calls our handler synchronously, but the
  // handler itself does an async publish. Yield twice so both
  // microtask queues drain.
  await new Promise((r) => setImmediate(r));
  await new Promise((r) => setImmediate(r));
}

describe('MQTTLogger', () => {
  let conn: MockAWSConnection;
  let logger: MQTTLogger;

  beforeEach(async () => {
    conn = new MockAWSConnection();
    logger = new MQTTLogger();
    await logger.init(conn as unknown as never);
  });

  describe('technical (tslog-driven) records', () => {
    test('publishes a LogRecord to ${CLIENT_ID}/logging at AtMostOnce', async () => {
      logger.logger.info('hello world');
      await flushAwsTransport();

      expect(conn.publishes).toHaveLength(1);
      const [pub] = conn.publishes;
      expect(pub.topic).toBe(`${CLIENT_ID}/logging`);
      expect(pub.qos).toBe(mqtt.QoS.AtMostOnce);

      const decoded = JSON.parse(String(pub.payload));
      expect(decoded.device_id).toBe(CLIENT_ID);
      expect(typeof decoded.timestamp).toBe('number');
      expect(decoded.level).toBe('info');
      expect(decoded.category).toBe('technical');
      expect(decoded.message).toBe('hello world');
      expect(decoded.meta).toBeUndefined();
      expect(typeof decoded.sequence).toBe('number');
    });

    test('joins multi-arg log calls into a single message string', async () => {
      logger.logger.info('count is', 42);
      await flushAwsTransport();

      const decoded = JSON.parse(String(conn.publishes[0].payload));
      expect(decoded.message).toBe('count is 42');
    });

    test('maps tslog warn / error / fatal into LogLevel warn / error', async () => {
      logger.logger.warn('a warning');
      logger.logger.error('an error');
      logger.logger.fatal('a fatal');
      await flushAwsTransport();

      const levels = conn.publishes.map((p) => JSON.parse(String(p.payload)).level);
      expect(levels).toEqual(['warn', 'error', 'error']);
    });

    test('debug / trace / silly do NOT ship to AWS (devNull transport)', async () => {
      logger.logger.debug('debug');
      logger.logger.trace('trace');
      logger.logger.silly('silly');
      await flushAwsTransport();

      expect(conn.publishes).toHaveLength(0);
    });

    test('increments sequence across calls', async () => {
      logger.logger.info('one');
      logger.logger.info('two');
      logger.logger.info('three');
      await flushAwsTransport();

      const sequences = conn.publishes.map((p) => JSON.parse(String(p.payload)).sequence);
      expect(sequences).toHaveLength(3);
      for (let i = 1; i < sequences.length; i += 1) {
        expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
      }
    });

    test('publish failure does not throw out of the logger pipeline', async () => {
      conn.failNextPublish = true;
      expect(() => logger.logger.info('will fail')).not.toThrow();
      await flushAwsTransport();
    });
  });

  describe('user-level API', () => {
    test('userInfo publishes a category=user record with the given message', async () => {
      await logger.userInfo('Watering "Morning veg" starting', {
        duration_s: 300,
        relays: [1, 2],
      });

      expect(conn.publishes).toHaveLength(1);
      const decoded = JSON.parse(String(conn.publishes[0].payload));
      expect(decoded.device_id).toBe(CLIENT_ID);
      expect(decoded.level).toBe('info');
      expect(decoded.category).toBe('user');
      expect(decoded.message).toBe('Watering "Morning veg" starting');
      expect(decoded.meta).toEqual({ duration_s: 300, relays: [1, 2] });
      expect(typeof decoded.timestamp).toBe('number');
    });

    test('userWarn / userError stamp the right level', async () => {
      await logger.userWarn('Pi degraded');
      await logger.userError('Watering failed');

      const decoded = conn.publishes.map((p) => JSON.parse(String(p.payload)));
      expect(decoded[0].level).toBe('warn');
      expect(decoded[0].category).toBe('user');
      expect(decoded[1].level).toBe('error');
      expect(decoded[1].category).toBe('user');
    });

    test('user-level publish failure is swallowed', async () => {
      conn.failNextPublish = true;
      await expect(logger.userInfo('will fail')).resolves.toBeUndefined();
    });

    test('userX omits the meta field when not supplied', async () => {
      await logger.userInfo('just a message');
      const decoded = JSON.parse(String(conn.publishes[0].payload));
      expect(decoded.meta).toBeUndefined();
    });
  });

  test('logger getter exposes the AWS-bound tslog instance', () => {
    expect(logger.logger).toBeDefined();
    expect(typeof logger.logger.info).toBe('function');
    expect(typeof logger.logger.error).toBe('function');
  });
});

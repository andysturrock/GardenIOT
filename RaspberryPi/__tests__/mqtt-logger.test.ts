import { describe, test, expect, beforeEach, vi } from 'vitest';
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

  test('publishes log records to ${CLIENT_ID}/logging at AtMostOnce', async () => {
    logger.logger.info('hello world');
    await flushAwsTransport();

    expect(conn.publishes).toHaveLength(1);
    const [pub] = conn.publishes;
    expect(pub.topic).toBe(`${CLIENT_ID}/logging`);
    expect(pub.qos).toBe(mqtt.QoS.AtMostOnce);

    const decoded = JSON.parse(String(pub.payload));
    expect(decoded.message).toBeDefined();
    expect(typeof decoded.sequence).toBe('number');
  });

  test('increments sequence across calls', async () => {
    conn.reset();
    logger.logger.info('one');
    logger.logger.info('two');
    logger.logger.info('three');
    await flushAwsTransport();

    const sequences = conn.publishes.map((p) => JSON.parse(String(p.payload)).sequence);
    expect(sequences).toHaveLength(3);
    // Monotonically increasing
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBeGreaterThan(sequences[i - 1]);
    }
  });

  test('warn/error/fatal also ship to AWS', async () => {
    conn.reset();
    logger.logger.warn('a warning');
    logger.logger.error('an error');
    logger.logger.fatal('a fatal');
    await flushAwsTransport();

    expect(conn.publishes).toHaveLength(3);
  });

  test('debug / trace / silly do NOT ship to AWS (devNull transport)', async () => {
    conn.reset();
    logger.logger.debug('debug');
    logger.logger.trace('trace');
    logger.logger.silly('silly');
    await flushAwsTransport();

    expect(conn.publishes).toHaveLength(0);
  });

  test('publish failure does not throw out of the logger pipeline', async () => {
    conn.reset();
    conn.failNextPublish = true;

    expect(() => logger.logger.info('will fail')).not.toThrow();
    await flushAwsTransport();
  });

  test('logger getter exposes the AWS-bound tslog instance', () => {
    expect(logger.logger).toBeDefined();
    expect(typeof logger.logger.info).toBe('function');
    expect(typeof logger.logger.error).toBe('function');
  });
});

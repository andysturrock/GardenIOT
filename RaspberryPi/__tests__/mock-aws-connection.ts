import { mqtt } from 'aws-crt';

interface Publish {
  topic: string;
  payload: unknown;
  qos: mqtt.QoS;
  retain?: boolean;
}

interface Subscription {
  topic: string;
  qos: mqtt.QoS;
  handler?: mqtt.OnMessageCallback;
}

/**
 * Stand-in for AWSConnection that records publish/subscribe activity
 * and lets tests deliver fake incoming messages. Shape matches
 * AWSConnection's public surface; cast to `AWSConnection` (via unknown)
 * where the call-site demands the real type.
 */
class MockAWSConnection {
  publishes: Publish[] = [];
  subscriptions: Subscription[] = [];
  unsubscribes: string[] = [];
  connected = false;
  publishOnlineCount = 0;
  publishOfflineCount = 0;
  statusTopic = 'test-client/status';

  /** Throw the next time publish() is called (then revert). */
  failNextPublish = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async publish(
    topic: string,
    payload: unknown,
    qos: mqtt.QoS,
    retain?: boolean,
  ): Promise<unknown> {
    if (this.failNextPublish) {
      this.failNextPublish = false;
      throw new Error('mock publish failure');
    }
    this.publishes.push({ topic, payload, qos, retain });
    return {};
  }

  async subscribe(
    topic: string,
    qos: mqtt.QoS,
    handler?: mqtt.OnMessageCallback,
  ): Promise<unknown> {
    this.subscriptions.push({ topic, qos, handler });
    return {};
  }

  async unsubscribe(topic: string): Promise<unknown> {
    this.unsubscribes.push(topic);
    return {};
  }

  async publishOnline(): Promise<void> {
    this.publishOnlineCount += 1;
    await this.publish(
      this.statusTopic,
      JSON.stringify({ online: true, timestamp: Date.now(), uptime_seconds: 0 }),
      mqtt.QoS.AtLeastOnce,
      true,
    );
  }

  async publishOffline(): Promise<void> {
    this.publishOfflineCount += 1;
    await this.publish(
      this.statusTopic,
      JSON.stringify({ online: false, reason: 'graceful' }),
      mqtt.QoS.AtLeastOnce,
      true,
    );
  }

  /**
   * Deliver a fake message to all handlers subscribed to `topic`.
   * Payload may be a string (encoded as UTF-8) or raw ArrayBuffer.
   */
  simulateMessage(topic: string, payload: string | ArrayBuffer): void {
    const buf: ArrayBuffer =
      typeof payload === 'string'
        ? new TextEncoder().encode(payload).buffer as ArrayBuffer
        : payload;
    const matches = this.subscriptions.filter((s) => s.topic === topic);
    if (matches.length === 0) {
      throw new Error(`MockAWSConnection: no subscription to '${topic}'`);
    }
    for (const sub of matches) {
      if (sub.handler) sub.handler(topic, buf, false, sub.qos, false);
    }
  }

  /** Publishes whose payload (JSON-encoded) includes the given fragment. */
  publishesMatching(fragment: string): Publish[] {
    return this.publishes.filter((p) => JSON.stringify(p.payload).includes(fragment));
  }

  /** Clear activity logs (publishes / unsubscribes / counts) but keep
   *  the subscription table — subscriptions reflect live MQTT state,
   *  not test instrumentation, and clearing them breaks subsequent
   *  simulateMessage() calls. */
  reset(): void {
    this.publishes = [];
    this.unsubscribes = [];
    this.publishOnlineCount = 0;
    this.publishOfflineCount = 0;
    this.failNextPublish = false;
  }

  /** Full reset including subscriptions. Use only at the end of a test
   *  or when you genuinely want a fresh connection. */
  resetAll(): void {
    this.reset();
    this.subscriptions = [];
  }
}

export { MockAWSConnection };

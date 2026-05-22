import { iot, mqtt } from 'aws-crt';
import mqttLogger from './mqtt-logger';
import getEnv from './utils/getenv';

const logger = mqttLogger.logger;

class AWSConnection {
  private connection : mqtt.MqttClientConnection | undefined;

  private readonly _config: mqtt.MqttConnectionConfig;

  private readonly _statusTopic: string;

  constructor() {
    const certFile = getEnv('CERTFILE', false)!;
    const keyFile = getEnv('KEYFILE', false)!;
    const caFile = getEnv('CAFILE', false)!;
    const clientId = getEnv('CLIENT_ID', false)!;
    const endpoint = getEnv('ENDPOINT', false)!;

    this._statusTopic = `${clientId}/status`;

    const configBuilder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      certFile,
      keyFile,
    );
    configBuilder.with_certificate_authority_from_path(undefined, caFile);
    configBuilder.with_clean_session(false);
    configBuilder.with_client_id(clientId);
    configBuilder.with_endpoint(endpoint);
    // Pre-set the Last Will & Testament. If the Pi disconnects
    // ungracefully (crash, power loss, network drop), the broker will
    // publish this message to the status topic so subscribers know the
    // Pi is offline. Graceful shutdowns publish offline themselves
    // before disconnect (see publishOffline).
    configBuilder.with_will(new mqtt.MqttWill(
      this._statusTopic,
      mqtt.QoS.AtLeastOnce,
      JSON.stringify({ online: false, reason: 'lwt' }),
      true,
    ));
    this._config = configBuilder.build();
  }

  get statusTopic(): string {
    return this._statusTopic;
  }

  async connect() {
    const client = new mqtt.MqttClient();
    this.connection = client.new_connection(this._config);
    this.connection.on('connect', () => { logger.info('AWS IoT: connect'); });
    this.connection.on('disconnect', () => { logger.warn('AWS IoT: disconnect'); });
    this.connection.on('interrupt', (error) => {
      logger.warn(`AWS IoT: interrupt: ${error?.error ?? error}`);
    });
    this.connection.on('resume', (returnCode, sessionPresent) => {
      logger.info(`AWS IoT: resume (rc=${returnCode}, sessionPresent=${sessionPresent})`);
    });
    this.connection.on('error', (error) => {
      logger.error(`AWS IoT: error: ${error?.error ?? error}`);
    });
    await this.connection.connect();
  }

  async disconnect() {
    if (this.connection) {
      await this.connection.disconnect();
    }
  }

  /**
   * Publish an "online" status to the retained status topic. Includes a
   * timestamp + uptime so subscribers can detect stale messages even
   * though the topic is retained.
   */
  async publishOnline() {
    await this.publish(
      this._statusTopic,
      JSON.stringify({
        online: true,
        timestamp: Date.now(),
        uptime_seconds: Math.round(process.uptime()),
      }),
      mqtt.QoS.AtLeastOnce,
      true,
    );
  }

  /**
   * Publish an "offline" status retained. Call before a graceful
   * disconnect so subscribers see the offline state without waiting
   * for the broker's keep-alive timeout + LWT.
   */
  async publishOffline() {
    await this.publish(
      this._statusTopic,
      JSON.stringify({ online: false, reason: 'graceful' }),
      mqtt.QoS.AtLeastOnce,
      true,
    );
  }

  async publish(
    topic: string,
    payload: mqtt.Payload,
    qos: mqtt.QoS,
    retain?: boolean,
  ): Promise<mqtt.MqttRequest | undefined> {
    return this.connection?.publish(topic, payload, qos, retain);
  }

  async subscribe(topic: string, qos: mqtt.QoS, on_message?: mqtt.OnMessageCallback): Promise<mqtt.MqttSubscribeRequest | undefined> {
    return this.connection?.subscribe(topic, qos, on_message);
  }

  async unsubscribe(topic: string): Promise<mqtt.MqttRequest | undefined> {
    return this.connection?.unsubscribe(topic);
  }
}

export default AWSConnection;

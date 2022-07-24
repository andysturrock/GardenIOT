import { iot, mqtt } from 'aws-crt';
import getEnv from './getenv';

class AWSConnection {
  private connection : mqtt.MqttClientConnection | undefined;

  private readonly _config: mqtt.MqttConnectionConfig;

  constructor() {
    const certFile = getEnv('CERTFILE', false)!;
    const keyFile = getEnv('KEYFILE', false)!;
    const caFile = getEnv('CAFILE', false)!;
    const clientId = getEnv('CLIENT_ID', false)!;
    const endpoint = getEnv('ENDPOINT', false)!;

    const configBuilder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(
      certFile,
      keyFile,
    );
    configBuilder.with_certificate_authority_from_path(undefined, caFile);
    configBuilder.with_clean_session(false);
    configBuilder.with_client_id(clientId);
    configBuilder.with_endpoint(endpoint);
    this._config = configBuilder.build();
  }

  async connect() {
    const client = new mqtt.MqttClient();
    this.connection = client.new_connection(this._config);
    this.connection.connect();
  }

  async disconnect() {
    this.connection?.disconnect();
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

import { iot, mqtt } from 'aws-crt';
import { getEnv } from './getenv';

export class AWSConnection {
  private readonly _connection;

  constructor() {
    const certFile = getEnv('CERTFILE', false)!;
    const keyFile = getEnv('KEYFILE', false)!;
    const caFile = getEnv('CAFILE', false)!;
    const clientId = getEnv('CLIENTID', false)!;
    const endpoint = getEnv('ENDPOINT', false)!;

    const config_builder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(certFile, keyFile);
    config_builder.with_certificate_authority_from_path(undefined, caFile);
    config_builder.with_clean_session(false);
    config_builder.with_client_id(clientId);
    config_builder.with_endpoint(endpoint);
    const config = config_builder.build();

    const client = new mqtt.MqttClient();
    this._connection = client.new_connection(config);
  }

  async connect() {
    this._connection.connect();
  }

  async disconnect() {
    this._connection.disconnect();
  }

  async publish(topic: string, payload: mqtt.Payload, qos: mqtt.QoS, retain?: boolean): Promise<mqtt.MqttRequest> {
    return this._connection.publish(topic, payload, qos, retain);
  }

  get connection() {
    return this._connection;
  }
}

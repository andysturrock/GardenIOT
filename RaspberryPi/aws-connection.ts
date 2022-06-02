import { iot, mqtt } from 'aws-crt';
import getEnv from './getenv';

class AWSConnection {
  private readonly connection;

  constructor() {
    const certFile = getEnv('CERTFILE', false)!;
    const keyFile = getEnv('KEYFILE', false)!;
    const caFile = getEnv('CAFILE', false)!;
    const clientId = getEnv('CLIENTID', false)!;
    const endpoint = getEnv('ENDPOINT', false)!;

    const configBuilder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(certFile, keyFile);
    configBuilder.with_certificate_authority_from_path(undefined, caFile);
    configBuilder.with_clean_session(false);
    configBuilder.with_client_id(clientId);
    configBuilder.with_endpoint(endpoint);
    const config = configBuilder.build();

    const client = new mqtt.MqttClient();
    this.connection = client.new_connection(config);
  }

  async connect() {
    this.connection.connect();
  }

  async disconnect() {
    this.connection.disconnect();
  }

  async publish(topic: string, payload: mqtt.Payload, qos: mqtt.QoS, retain?: boolean): Promise<mqtt.MqttRequest> {
    return this.connection.publish(topic, payload, qos, retain);
  }
}

export default AWSConnection;

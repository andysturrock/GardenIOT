import { Logger as TSLogger } from 'tslog';
import { mqtt } from 'aws-crt';
import getEnv from './getenv';
import AWSConnection from './aws-connection';

class MQTTLogger {
  private sequence = 1;

  private connection: AWSConnection | undefined;

  private topic;

  private logger;

  constructor() {
    this.logger = new TSLogger();

    try {
      this.topic = getEnv('LOGGING_TOPIC', false)!;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  async init() {
    this.connection = new AWSConnection();
    await this.connection.connect();
  }

  async dispose() {
    await this.connection?.disconnect();
  }

  private async sendMessage(message: string) {
    const msg = {
      message,
      sequence: this.sequence,
    };
    this.sequence += 1; // eslint complains about postfix ++
    const json = JSON.stringify(msg);
    await this.connection?.publish(this.topic, json, mqtt.QoS.AtLeastOnce);
  }

  async silly(message: string) {
    this.logger.silly(message);
    this.sendMessage(message);
  }

  async trace(message: string) {
    this.logger.trace(message);
    this.sendMessage(message);
  }

  async debug(message: string) {
    this.logger.debug(message);
    this.sendMessage(message);
  }

  async info(message: string) {
    this.logger.info(message);
    this.sendMessage(message);
  }

  async warn(message: string) {
    this.logger.warn(message);
    this.sendMessage(message);
  }

  async error(message: string) {
    this.logger.error(message);
    this.sendMessage(message);
  }

  async fatal(message: string) {
    this.logger.fatal(message);
    this.sendMessage(message);
  }
}

const mqttLogger = new MQTTLogger();

export default mqttLogger;

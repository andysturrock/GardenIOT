import { Logger as TSLogger } from 'tslog';
import * as awscrt from 'aws-crt';
import getEnv from './getenv';
import AWSConnection from './aws-connection';

class MQTTLogger {
  private sequence = 1;

  private connection;

  private topic;

  private logger;

  constructor(connection: AWSConnection) {
    this.connection = connection;
    this.logger = new TSLogger();

    try {
      this.topic = getEnv('LOGGING_TOPIC', false)!;
    } catch (error) {
      this.logger.error(error);
      throw error;
    }
  }

  private async sendMessage(message: string) {
    const msg = {
      message,
      sequence: this.sequence,
    };
    this.sequence += 1; // eslint complains about postfix ++
    const json = JSON.stringify(msg);
    await this.connection.publish(this.topic, json, awscrt.mqtt.QoS.AtLeastOnce);
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

export default MQTTLogger;

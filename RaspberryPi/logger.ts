import { Logger as TSLogger } from 'tslog';
import * as awscrt from 'aws-crt';
import { getEnv } from './getenv';
import { AWSConnection } from './aws-connection';

export class Logger {
  private _sequence = 1;

  private _connection;

  private _topic;

  private _logger;

  constructor(connection: AWSConnection) {
    this._connection = connection;
    this._logger = new TSLogger();

    try {
      this._topic = getEnv('LOGGING_TOPIC', false)!;
    } catch (error) {
      this._logger.error(error);
      throw error;
    }
  }

  async _sendMessage(message: string) {
    const msg = {
      message,
      sequence: this._sequence++,
    };
    const json = JSON.stringify(msg);
    await this._connection.publish(this._topic, json, awscrt.mqtt.QoS.AtLeastOnce);
  }

  async silly(message: string) {
    const logObject = this._logger.silly(message);
    this._sendMessage(message);
  }

  async trace(message: string) {
    const logObject = this._logger.trace(message);
    this._sendMessage(message);
  }

  async debug(message: string) {
    const logObject = this._logger.debug(message);
    this._sendMessage(message);
  }

  async info(message: string) {
    const logObject = this._logger.info(message);
    this._sendMessage(message);
  }

  async warn(message: string) {
    const logObject = this._logger.warn(message);
    this._sendMessage(message);
  }

  async error(message: string) {
    const logObject = this._logger.error(message);
    this._sendMessage(message);
  }

  async fatal(message: string) {
    const logObject = this._logger.fatal(message);
    this._sendMessage(message);
  }
}

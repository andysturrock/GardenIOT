import { ILogObject, Logger as TSLogger } from 'tslog';
import { mqtt } from 'aws-crt';
import getEnv from './getenv';
import AWSConnection from './aws-connection';
import util from 'util';

class MQTTLogger {
  private sequence = 0;

  private connection: AWSConnection | undefined;

  private topic;

  private _mainLogger;
  private _awsLogger;
  private _localOnlyLogger;

  constructor() {
    this._mainLogger = new TSLogger();
    this._awsLogger = this._mainLogger.getChildLogger({name: "MQTTLogger"});
    this._localOnlyLogger = new TSLogger();

    try {
      this.topic = getEnv('LOGGING_TOPIC', false)!;
    } catch (error) {
      this._localOnlyLogger.error(error);
      throw error;
    }
  }
  
  async init() {
    try {
      this.connection = new AWSConnection();
      await this.connection.connect();
      this._awsLogger.attachTransport(
        {
          silly: this.sendMessage.bind(this),
          debug: this.sendMessage.bind(this),
          trace: this.sendMessage.bind(this),
          info: this.sendMessage.bind(this),
          warn: this.sendMessage.bind(this),
          error: this.sendMessage.bind(this),
          fatal: this.sendMessage.bind(this),
        },
        "silly"
      );
    } catch (error) {
      this._localOnlyLogger.error(error);
      throw error;
    }
  }

  async dispose() {
    try {
      await this.connection?.disconnect();
    } catch (error) {
      this._localOnlyLogger.error(error);
      throw error;
    }
  }

  private async sendMessage(logObject: ILogObject) {
    try {
      this.sendMessageAsync(logObject);
    } catch (error) {
      this._localOnlyLogger.error(error);
      throw error;
    }
  }

  private async sendMessageAsync(logObject: ILogObject) {
    try {
      // Increment first.  MQTT seems to start packet ids at 1.
      this.sequence += 1; // eslint complains about postfix ++
      const msg = {
        message: logObject,
        sequence: this.sequence,
      };
      const json = JSON.stringify(msg);
      // Assert connection is defined here as should be impossible to call this
      // function without calling init() first.
      const res = await this.connection!.publish(this.topic, json, mqtt.QoS.AtLeastOnce);

      if(!res) {
        this._localOnlyLogger.warn(`Sending log to AWS may have failed: ${res}`);
      }
    }
    catch (error) {
      this._localOnlyLogger.error(`Sending log to AWS has probably failed.`);
      this._localOnlyLogger.error(`Error: ${util.inspect(error)}`);
    }
  }

  public get logger() {
    return this._awsLogger;
  }
}

const mqttLogger = new MQTTLogger();

export default mqttLogger;

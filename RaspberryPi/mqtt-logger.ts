import { ILogObject, Logger as TSLogger } from 'tslog';
import { mqtt } from 'aws-crt';
import getEnv from './utils/getenv';
import AWSConnection from './aws-connection';
import { LogLevel, LogRecord } from './serialization/log-record';
import util from 'node:util';

function mapTsLogLevel(level: string): LogLevel {
  switch (level) {
    case 'silly':
    case 'trace':
    case 'debug':
      return 'debug';
    case 'info':  return 'info';
    case 'warn':  return 'warn';
    case 'error':
    case 'fatal': return 'error';
    default:      return 'info';
  }
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return '';
  return args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ');
}

class MQTTLogger {
  private sequence = 0;

  private _awsConnection: AWSConnection | undefined;

  private topic = "";

  private clientId = "";

  private _mainLogger;
  private _awsLogger;
  private _localOnlyLogger;

  constructor() {
    this._mainLogger = new TSLogger();
    this._awsLogger = this._mainLogger.getChildLogger({name: "MQTTLogger"});
    this._localOnlyLogger = new TSLogger();
    // We have a convention that the thing logs to ${CLIENT_ID}/logging
    this.clientId = getEnv('CLIENT_ID', false)!;
    this.topic = `${this.clientId}/logging`;
  }

  async init(awsConnection : AWSConnection) {
    this._awsConnection = awsConnection;
    try {
      this._awsLogger.attachTransport(
        {
          silly: this.devNull.bind(this),
          debug: this.devNull.bind(this),
          trace: this.devNull.bind(this),
          info: this.sendTechnical.bind(this),
          warn: this.sendTechnical.bind(this),
          error: this.sendTechnical.bind(this),
          fatal: this.sendTechnical.bind(this),
        },
        "silly"
      );
    } catch (error) {
      this._localOnlyLogger.error(error);
      throw error;
    }
  }

  private async devNull(_logObject: ILogObject) {
  }

  private async sendTechnical(logObject: ILogObject) {
    const record: LogRecord = {
      device_id: this.clientId,
      timestamp: logObject.date instanceof Date ? logObject.date.getTime() : Date.now(),
      level: mapTsLogLevel(logObject.logLevel),
      category: 'technical',
      message: formatArgs(logObject.argumentsArray),
    };
    await this.publishRecord(record);
  }

  async userInfo(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.sendUser('info', message, meta);
  }

  async userWarn(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.sendUser('warn', message, meta);
  }

  async userError(message: string, meta?: Record<string, unknown>): Promise<void> {
    await this.sendUser('error', message, meta);
  }

  private async sendUser(
    level: LogLevel,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    const record: LogRecord = {
      device_id: this.clientId,
      timestamp: Date.now(),
      level,
      category: 'user',
      message,
    };
    if (meta !== undefined) record.meta = meta;
    await this.publishRecord(record);
  }

  private async publishRecord(record: LogRecord): Promise<void> {
    try {
      this.sequence += 1; // eslint complains about postfix ++
      const payload = JSON.stringify({ ...record, sequence: this.sequence });
      // Assert connection is defined here as should be impossible to call this
      // function without calling init() first.
      await this._awsConnection!.publish(this.topic, payload, mqtt.QoS.AtMostOnce);
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
// Class export so tests can instantiate fresh instances without
// inheriting the singleton's accumulated transports.
export { MQTTLogger };

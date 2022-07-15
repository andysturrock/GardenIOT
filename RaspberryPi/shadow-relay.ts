import AWSConnection from './aws-connection';
import { mqtt } from 'aws-crt';
import getEnv from './getenv';
import mqttLogger from './mqtt-logger';
import Relay from './relay';
import { RelayId } from './relay-id';

const gpio = require('rpi-gpio').promise;

const logger = mqttLogger.logger;

class ShadowRelay extends Relay {
  private _awsConnection : AWSConnection;
  private thingName: string;

  constructor(id : RelayId, awsConnection: AWSConnection) {
    super(id);
    this._awsConnection = awsConnection;
    this.thingName = getEnv('CLIENT_ID', false)!;
  }

  async init() {
    super.init();
    await this.subscribe();
  }

  async open() {
    await super.open();
    await this.publishShadowUpdate('open');
  }

  async close() {
    await super.close();
    // await this.publishShadowUpdate('closed');
  }

  private async publishShadowUpdate(openClosed: string) {
    const topic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
    const stateReportedDoc = `
    {
      "state": {
          "reported": {
              "open_closed": ${openClosed}
          }
      }
    }
    `;
    await this._awsConnection.publish(topic, stateReportedDoc, mqtt.QoS.AtLeastOnce);
  }

  private sendDebug(method: string, topic: string, payload: ArrayBuffer) {
    const textDecoder = new TextDecoder("utf-8");
    const json = {
      method: method,
      topic: topic,
      payload: textDecoder.decode(payload)
    }
    logger.debug(JSON.stringify(json));
  }

  private onAccepted(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.sendDebug('onAccepted', topic, payload);
  }

  private onRejected(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.sendDebug('onRejected', topic, payload);
  }

  private onDelta(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.sendDebug('onDelta', topic, payload);
  }

  private onDocuments(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.sendDebug('sendDebug', topic, payload);
  }

  private async subscribe() {
    const baseTopic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
    this._awsConnection.subscribe(`${baseTopic}/accepted`, mqtt.QoS.AtLeastOnce, this.onAccepted.bind(this));
    this._awsConnection.subscribe(`${baseTopic}/rejected`, mqtt.QoS.AtLeastOnce, this.onRejected.bind(this));
    this._awsConnection.subscribe(`${baseTopic}/delta`, mqtt.QoS.AtLeastOnce, this.onDelta.bind(this));
    this._awsConnection.subscribe(`${baseTopic}/documents`, mqtt.QoS.AtLeastOnce, this.onDocuments.bind(this));
  }
}

export default ShadowRelay;

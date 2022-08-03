import AWSConnection from './aws-connection';
import { mqtt } from 'aws-crt';
import getEnv from './utils/getenv';
import mqttLogger from './mqtt-logger';
import Relay from './relay';
import { RelayId } from './relay-id';

const gpio = require('rpi-gpio').promise;

const logger = mqttLogger.logger;

class ShadowRelay extends Relay {
  private _awsConnection : AWSConnection;
  private thingName: string;
  private version = 0;

  constructor(id : RelayId, awsConnection: AWSConnection) {
    super(id);
    this._awsConnection = awsConnection;
    this.thingName = getEnv('CLIENT_ID', false)!;
  }

  async init() {
    // Must subscribe first so we get the initial events from super.init()
    await this.subscribe();
    await super.init();
  }

  async dispose() {
    await super.dispose();
    await this.unsubscribe();
  }

  async open() {
    // Open the relay directly.
    // Do this rather than waiting to respond to the desired message
    // in case our connection to AWS has failed.
    await super.open();
    // Update the shadow state.
    // This will cause the relay to be opened again, but that's OK.
    await this.publishDesiredShadowUpdate('open');
  }

  async close() {
    // Close the relay directly.
    // Do this rather than waiting to respond to the desired message
    // in case our connection to AWS has failed.
    await super.close();
    // Update the shadow state.
    // This will cause the relay to be closed again, but that's OK.
    await this.publishDesiredShadowUpdate('closed');
  }

  async emergencyClose() {
    await super.close();
  }

  // Called in response to a desired message.
  private async _open() {
    await super.open();
    await this.publishReportedShadowUpdate('open');
  }

  // Called in response to a desired message.
  private async _close() {
    await super.close();
    await this.publishReportedShadowUpdate('closed');
  }

  private async publishDesiredShadowUpdate(openClosed: string) {
    try {
      const topic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
      const stateReportedDoc = 
      {
        "state": {
            "desired": {
                "open_closed": `${openClosed}`
            }
        }
      };
      await this._awsConnection.publish(topic, stateReportedDoc, mqtt.QoS.AtLeastOnce);
    }
    catch(error) {
      if(error instanceof Error) {
        logger.error(`Error: ${error.stack}`);
      } else {
        logger.error(`Error: ${JSON.stringify(error)}`);
      }
    }
  }

  private async publishReportedShadowUpdate(openClosed: string) {
    try {
      const topic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
      const stateReportedDoc = 
      {
        "state": {
            "reported": {
                "open_closed": `${openClosed}`
            }
        }
      };
      await this._awsConnection.publish(topic, stateReportedDoc, mqtt.QoS.AtLeastOnce);
    }
    catch(error) {
      if(error instanceof Error) {
        logger.error(`Error: ${error.stack}`);
      } else {
        logger.error(`Error: ${JSON.stringify(error)}`);
      }
    }
  }

  private debugLog(method: string, topic: string, payload: ArrayBuffer) {
    
    const json = {
      method: method,
      topic: topic,
      payload: this.decodePayload(payload)
    }
    logger.debug(JSON.stringify(json));
  }

  private decodePayload(payload: ArrayBuffer) {
    const textDecoder = new TextDecoder("utf-8");
    return textDecoder.decode(payload);
  }

  private onAccepted(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.debugLog('onAccepted', topic, payload);
  }

  private onRejected(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.debugLog('onRejected', topic, payload);
  }

  private async onDelta(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : Promise<void> {
    this.debugLog('onDelta', topic, payload);

    const decodedPayload = JSON.parse(this.decodePayload(payload));
    const version = decodedPayload?.version;
    if(version < this.version) {
      logger.debug(`Discarding delta with lower version (current version = ${this.version}, delta version = ${version}).`);
      return;
    }
    logger.debug(`onDelta current version = ${this.version}, delta version = ${version}`)

    if(decodedPayload?.state?.open_closed === 'open') {
      await this._open();
    } else if(decodedPayload?.state?.open_closed === 'closed') {
      await this._close();
    }
    else {
      logger.warn(`Unknown delta relay state`)
    }
  }

  private onDocuments(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.debugLog('onDocuments', topic, payload);
    const decodedPayload = JSON.parse(this.decodePayload(payload));
    this.version = decodedPayload?.current?.version;
    logger.debug(`onDocs current version = ${this.version}`)
  }

  private async subscribe() {
    const baseTopic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
    await this._awsConnection.subscribe(`${baseTopic}/accepted`, mqtt.QoS.AtLeastOnce, this.onAccepted.bind(this));
    await this._awsConnection.subscribe(`${baseTopic}/rejected`, mqtt.QoS.AtLeastOnce, this.onRejected.bind(this));
    await this._awsConnection.subscribe(`${baseTopic}/delta`, mqtt.QoS.AtLeastOnce, this.onDelta.bind(this));
    await this._awsConnection.subscribe(`${baseTopic}/documents`, mqtt.QoS.AtLeastOnce, this.onDocuments.bind(this));
  }

  private async unsubscribe() {
    const baseTopic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
    await this._awsConnection.unsubscribe(`${baseTopic}/accepted`);
    await this._awsConnection.unsubscribe(`${baseTopic}/rejected`);
    await this._awsConnection.unsubscribe(`${baseTopic}/delta`);
    await this._awsConnection.unsubscribe(`${baseTopic}/documents`);
  }
}

export default ShadowRelay;

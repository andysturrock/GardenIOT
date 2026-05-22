import AWSConnection from './aws-connection';
import { mqtt } from 'aws-crt';
import getEnv from './utils/getenv';
import mqttLogger from './mqtt-logger';
import Relay from './relay';
import { RelayId } from './relay-id';

const logger = mqttLogger.logger;

class ShadowRelay extends Relay {
  private _awsConnection : AWSConnection;
  private thingName: string;
  private version = 0;
  // qos to use for all operations.
  private qos = mqtt.QoS.AtLeastOnce;
  // Auto-close externally-opened relays after 5 mins as a safety net.
  private openTimeout = 1000 * 60 * 5;
  // Handle for the safety timeout so we can cancel it on close.
  private safetyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(id : RelayId, awsConnection: AWSConnection) {
    super(id);
    this._awsConnection = awsConnection;
    this.thingName = getEnv('CLIENT_ID', false)!;
  }

  async init() {
    // Subscribe first so we get the initial events from super.init().
    await this.subscribe();
    await super.init();
  }

  async dispose() {
    this.cancelSafetyTimer();
    await super.dispose();
    await this.unsubscribe();
  }

  async open() {
    // Open the relay directly. Do this rather than waiting to respond to
    // the desired message in case our connection to AWS has failed.
    await super.open();
    // Update the shadow state. This will cause the relay to be opened
    // again, but that's OK.
    await this.publishDesiredShadowUpdate('open');
  }

  async close() {
    await super.close();
    await this.publishDesiredShadowUpdate('closed');
  }

  /**
   * Hard-close the relay regardless of the desired state. Used by the
   * safety timer and shutdown handlers. Publishes BOTH reported=closed
   * AND desired=closed in a single shadow update so no fresh delta is
   * generated that would re-trigger _open.
   */
  async forceClose() {
    this.cancelSafetyTimer();
    await super.close();
    await this.publishForceCloseShadowUpdate();
  }

  /**
   * Synchronous best-effort GPIO close, no MQTT. For uncaughtException /
   * unhandledRejection handlers where the process is about to die.
   */
  async emergencyClose() {
    this.cancelSafetyTimer();
    await super.close();
  }

  // Called in response to a desired message.
  private async _open() {
    this.cancelSafetyTimer();
    this.safetyTimer = setTimeout(() => { void this.forceClose(); }, this.openTimeout);
    await super.open();
    await this.publishReportedShadowUpdate('open');
  }

  // Called in response to a desired message.
  private async _close() {
    this.cancelSafetyTimer();
    await super.close();
    await this.publishReportedShadowUpdate('closed');
  }

  private cancelSafetyTimer() {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = undefined;
    }
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
      await this._awsConnection.publish(topic, stateReportedDoc, this.qos);
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
      await this._awsConnection.publish(topic, stateReportedDoc, this.qos);
    }
    catch(error) {
      if(error instanceof Error) {
        logger.error(`Error: ${error.stack}`);
      } else {
        logger.error(`Error: ${JSON.stringify(error)}`);
      }
    }
  }

  private async publishForceCloseShadowUpdate() {
    try {
      const topic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
      const stateDoc = {
        "state": {
            "reported": { "open_closed": "closed" },
            "desired":  { "open_closed": "closed" }
        }
      };
      await this._awsConnection.publish(topic, stateDoc, this.qos);
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

    let decodedPayload: any;
    try {
      decodedPayload = JSON.parse(this.decodePayload(payload));
    } catch (e) {
      logger.warn(`Failed to parse delta payload on ${topic}: ${e}`);
      return;
    }

    const version = decodedPayload?.version;
    if (typeof version !== 'number') {
      logger.warn(`Delta on ${topic} missing version; ignoring`);
      return;
    }
    if (version < this.version) {
      logger.debug(`Discarding delta with lower version (current version = ${this.version}, delta version = ${version}).`);
      return;
    }
    logger.debug(`onDelta current version = ${this.version}, delta version = ${version}`);

    const desired = decodedPayload?.state?.open_closed;
    if (desired === 'open') {
      await this._open();
    } else if (desired === 'closed') {
      await this._close();
    } else {
      logger.warn(`Unknown delta relay state: ${desired}`);
    }
  }

  private onDocuments(topic: string, payload: ArrayBuffer, dup: boolean, qos: mqtt.QoS, retain: boolean) : void {
    this.debugLog('onDocuments', topic, payload);
    try {
      const decodedPayload = JSON.parse(this.decodePayload(payload));
      this.version = decodedPayload?.current?.version ?? this.version;
      logger.debug(`onDocs current version = ${this.version}`);
    } catch (e) {
      logger.warn(`Failed to parse documents payload on ${topic}: ${e}`);
    }
  }

  private async subscribe() {
    const baseTopic = `$aws/things/${this.thingName}/shadow/name/${this.name}/update`;
    await this._awsConnection.subscribe(`${baseTopic}/accepted`, this.qos, this.onAccepted.bind(this));
    await this._awsConnection.subscribe(`${baseTopic}/rejected`, this.qos, this.onRejected.bind(this));
    await this._awsConnection.subscribe(`${baseTopic}/delta`, this.qos, this.onDelta.bind(this));
    await this._awsConnection.subscribe(`${baseTopic}/documents`, this.qos, this.onDocuments.bind(this));
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

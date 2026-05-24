import AWSConnection from './aws-connection';
import { mqtt } from 'aws-crt';
import getEnv from './utils/getenv';
import mqttLogger from './mqtt-logger';
import Relay from './relay';
import { RelayId } from './relay-id';

const logger = mqttLogger.logger;

// How long to wait, after a desired-state change, for the actual GPIO
// state to catch up before we declare a fault. Short enough to be a
// useful signal, long enough to absorb a slow gpio.write or transient
// hiccup.
const ACTUAL_MATCH_TIMEOUT_MS = 5_000;

export type BedNameResolver = () => string | undefined;

class ShadowRelay extends Relay {
  private _awsConnection : AWSConnection;
  private thingName: string;
  // Index in the config schema (1..4), distinct from the GPIO pin id on
  // Relay. We need it to look up the bed name from GardenConfig.beds.
  private readonly configRelayId: number;
  private bedNameResolver?: BedNameResolver;
  private version = 0;
  // qos to use for all operations.
  private qos = mqtt.QoS.AtLeastOnce;
  // Auto-close externally-opened relays after 5 mins as a safety net.
  private openTimeout = 1000 * 60 * 5;
  // Handle for the safety timeout so we can cancel it on close.
  private safetyTimer: ReturnType<typeof setTimeout> | undefined;
  // Watchdog that fires if a desired-state change doesn't get reflected
  // by an actual GPIO state change within ACTUAL_MATCH_TIMEOUT_MS.
  private actualMatchTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(id : RelayId, awsConnection: AWSConnection, configRelayId: number) {
    super(id);
    this._awsConnection = awsConnection;
    this.thingName = getEnv('CLIENT_ID', false)!;
    this.configRelayId = configRelayId;
  }

  /**
   * Wire a function that returns the current bed name for this relay's
   * config id (1..4). Used to dress user-facing log messages. The
   * resolver is called at log time, not at wire time, so renaming a
   * bed via the config shadow is reflected immediately.
   */
  setBedNameResolver(resolver: BedNameResolver): void {
    this.bedNameResolver = resolver;
  }

  async init() {
    // Subscribe first so we get the initial events from super.init().
    await this.subscribe();
    await super.init();
  }

  async dispose() {
    this.cancelSafetyTimer();
    this.cancelActualMatchWatchdog();
    await super.dispose();
    await this.unsubscribe();
  }

  async open() {
    // Open the relay directly. Do this rather than waiting to respond to
    // the desired message in case our connection to AWS has failed.
    this.armActualMatchWatchdog('open');
    await super.open();
    // Update the shadow state. This will cause the relay to be opened
    // again, but that's OK — Relay.open() is idempotent now.
    await this.publishDesiredShadowUpdate('open');
  }

  async close() {
    this.armActualMatchWatchdog('closed');
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
    this.cancelActualMatchWatchdog();
    await super.close();
    await this.publishForceCloseShadowUpdate();
  }

  /**
   * Synchronous best-effort GPIO close, no MQTT. For uncaughtException /
   * unhandledRejection handlers where the process is about to die.
   */
  async emergencyClose() {
    this.cancelSafetyTimer();
    this.cancelActualMatchWatchdog();
    await super.close();
  }

  // Called in response to a desired message.
  private async _open() {
    this.cancelSafetyTimer();
    this.safetyTimer = setTimeout(() => { void this.forceClose(); }, this.openTimeout);
    this.armActualMatchWatchdog('open');
    await super.open();
    await this.publishReportedShadowUpdate('open');
  }

  // Called in response to a desired message.
  private async _close() {
    this.cancelSafetyTimer();
    this.armActualMatchWatchdog('closed');
    await super.close();
    await this.publishReportedShadowUpdate('closed');
  }

  private cancelSafetyTimer() {
    if (this.safetyTimer) {
      clearTimeout(this.safetyTimer);
      this.safetyTimer = undefined;
    }
  }

  private cancelActualMatchWatchdog() {
    if (this.actualMatchTimer) {
      clearTimeout(this.actualMatchTimer);
      this.actualMatchTimer = undefined;
    }
  }

  private armActualMatchWatchdog(target: 'open' | 'closed') {
    this.cancelActualMatchWatchdog();
    const targetOpen = target === 'open';
    // Already in the desired position — nothing to watch for. Avoids
    // arming on every WateringJob → delta echo where the relay was
    // pre-opened directly.
    if (this.isOpen === targetOpen) return;
    this.actualMatchTimer = setTimeout(() => {
      this.actualMatchTimer = undefined;
      if (this.isOpen === targetOpen) return;
      const actual = this.isOpen ? 'open' : 'closed';
      const bedName = this.resolveBedName();
      logger.error(
        `ShadowRelay ${this.name}: desired=${target} but actual=${actual} after ${ACTUAL_MATCH_TIMEOUT_MS}ms`,
      );
      void mqttLogger.userError(
        `${bedName} did not respond to a watering command`,
        { relay: this.name, expected: target, actual },
      );
    }, ACTUAL_MATCH_TIMEOUT_MS);
  }

  private resolveBedName(): string {
    return this.bedNameResolver?.() ?? `Relay ${this.configRelayId}`;
  }

  protected async onActualStateChange(state: 'open' | 'closed'): Promise<void> {
    this.cancelActualMatchWatchdog();
    const bedName = this.resolveBedName();
    const verb = state === 'open' ? 'started' : 'stopped';
    void mqttLogger.userInfo(`Watering "${bedName}" ${verb}`, { relay: this.name });
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

import { mqtt } from 'aws-crt';
import AWSConnection from './aws-connection';
import getEnv from './utils/getenv';
import mqttLogger from './mqtt-logger';
import {
  GardenConfig,
  GardenConfigError,
  defaultGardenConfig,
  parseGardenConfig,
} from './serialization/garden-config';

const logger = mqttLogger.logger;

export type ConfigChangedCallback = (config: GardenConfig) => void | Promise<void>;

/**
 * Subscribes to the `config` named shadow on the Pi Thing and surfaces
 * config changes via a callback. Mirrors the shadow-relay.ts pattern.
 *
 * Contract with the app: writers (the app) always publish the FULL
 * desired `GardenConfig` document; the Pi treats any delta as the new
 * full config and validates it with parseGardenConfig. Invalid configs
 * are logged and ignored.
 *
 * First-boot bootstrap: if get/rejected returns code 404 (no shadow
 * exists), the Pi publishes defaultGardenConfig() as both reported and
 * desired so subsequent boots — and the app — see a populated shadow.
 */
class ConfigShadow {
  private readonly aws: AWSConnection;
  private readonly thingName: string;
  private readonly qos = mqtt.QoS.AtLeastOnce;
  private readonly onChanged: ConfigChangedCallback;
  private version = 0;
  private currentConfig: GardenConfig | null = null;

  constructor(aws: AWSConnection, onChanged: ConfigChangedCallback) {
    this.aws = aws;
    this.thingName = getEnv('CLIENT_ID', false)!;
    this.onChanged = onChanged;
  }

  get baseTopic(): string {
    return `$aws/things/${this.thingName}/shadow/name/config`;
  }

  get config(): GardenConfig | null {
    return this.currentConfig;
  }

  async init(): Promise<void> {
    await this.subscribe();
    await this.publishGet();
  }

  async dispose(): Promise<void> {
    await this.unsubscribe();
  }

  private async subscribe(): Promise<void> {
    await this.aws.subscribe(`${this.baseTopic}/get/accepted`, this.qos, this.onGetAccepted.bind(this));
    await this.aws.subscribe(`${this.baseTopic}/get/rejected`, this.qos, this.onGetRejected.bind(this));
    await this.aws.subscribe(`${this.baseTopic}/update/accepted`, this.qos, this.onUpdateAccepted.bind(this));
    await this.aws.subscribe(`${this.baseTopic}/update/rejected`, this.qos, this.onUpdateRejected.bind(this));
    await this.aws.subscribe(`${this.baseTopic}/update/delta`, this.qos, this.onDelta.bind(this));
    await this.aws.subscribe(`${this.baseTopic}/update/documents`, this.qos, this.onDocuments.bind(this));
  }

  private async unsubscribe(): Promise<void> {
    await this.aws.unsubscribe(`${this.baseTopic}/get/accepted`);
    await this.aws.unsubscribe(`${this.baseTopic}/get/rejected`);
    await this.aws.unsubscribe(`${this.baseTopic}/update/accepted`);
    await this.aws.unsubscribe(`${this.baseTopic}/update/rejected`);
    await this.aws.unsubscribe(`${this.baseTopic}/update/delta`);
    await this.aws.unsubscribe(`${this.baseTopic}/update/documents`);
  }

  private decode(payload: ArrayBuffer): string {
    return new TextDecoder('utf-8').decode(payload);
  }

  private parseEnvelope(topic: string, payload: ArrayBuffer): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(this.decode(payload));
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return null;
    } catch (e) {
      logger.warn(`ConfigShadow: failed to parse ${topic}: ${e}`);
      return null;
    }
  }

  private async publishGet(): Promise<void> {
    try {
      await this.aws.publish(`${this.baseTopic}/get`, '', this.qos);
    } catch (e) {
      logger.error(`ConfigShadow: publishGet failed: ${e}`);
    }
  }

  private async publishSeed(): Promise<void> {
    const config = defaultGardenConfig();
    logger.info('ConfigShadow: no shadow yet; seeding with defaultGardenConfig');
    try {
      await this.aws.publish(
        `${this.baseTopic}/update`,
        JSON.stringify({ state: { reported: config, desired: config } }),
        this.qos,
      );
    } catch (e) {
      logger.error(`ConfigShadow: seed publish failed: ${e}`);
    }
  }

  private async publishReported(config: GardenConfig): Promise<void> {
    try {
      await this.aws.publish(
        `${this.baseTopic}/update`,
        JSON.stringify({ state: { reported: config } }),
        this.qos,
      );
    } catch (e) {
      logger.error(`ConfigShadow: reported publish failed: ${e}`);
    }
  }

  private async applyAndReport(raw: unknown, emitUserNotice = false): Promise<void> {
    let config: GardenConfig;
    try {
      config = parseGardenConfig(raw);
    } catch (e) {
      if (e instanceof GardenConfigError) {
        logger.error(`ConfigShadow: invalid config: ${e.message}`);
      } else {
        logger.error(`ConfigShadow: parse failed: ${e}`);
      }
      return;
    }
    this.currentConfig = config;
    try {
      await this.onChanged(config);
    } catch (e) {
      logger.error(`ConfigShadow: onChanged callback threw: ${e}`);
    }
    await this.publishReported(config);
    if (emitUserNotice) {
      // Initial-load apply (from get/accepted) intentionally skips this —
      // operators don't need a "Schedule updated" notice every Pi restart.
      void mqttLogger.userInfo('Schedule updated', { job_count: config.jobs.length });
    }
  }

  private onGetAccepted(topic: string, payload: ArrayBuffer): void {
    const env = this.parseEnvelope(topic, payload);
    if (!env) return;
    const v = typeof env.version === 'number' ? env.version : 0;
    this.version = Math.max(this.version, v);
    const state = env.state as Record<string, unknown> | undefined;
    const desired = state?.desired;
    const reported = state?.reported;
    const initial = desired ?? reported;
    if (initial) {
      void this.applyAndReport(initial);
    } else {
      logger.info('ConfigShadow: get/accepted with empty state; seeding');
      void this.publishSeed();
    }
  }

  private onGetRejected(topic: string, payload: ArrayBuffer): void {
    const env = this.parseEnvelope(topic, payload);
    const code = env && typeof env.code === 'number' ? env.code : undefined;
    if (code === 404) {
      void this.publishSeed();
    } else {
      logger.warn(`ConfigShadow: get/rejected: ${this.decode(payload)}`);
    }
  }

  private onUpdateAccepted(topic: string, payload: ArrayBuffer): void {
    const env = this.parseEnvelope(topic, payload);
    if (env && typeof env.version === 'number') {
      this.version = Math.max(this.version, env.version);
    }
  }

  private onUpdateRejected(topic: string, payload: ArrayBuffer): void {
    logger.warn(`ConfigShadow: update/rejected: ${this.decode(payload)}`);
  }

  private onDelta(topic: string, payload: ArrayBuffer): void {
    // AWS IoT deltas only carry the changed fields, not a full GardenConfig,
    // so parseGardenConfig would always reject them. We rely on
    // update/documents (which has the full current.state.desired) to apply
    // changes. Keep this handler to bump the version counter.
    const env = this.parseEnvelope(topic, payload);
    if (!env) return;
    const v = typeof env.version === 'number' ? env.version : 0;
    if (v > this.version) this.version = v;
  }

  private onDocuments(topic: string, payload: ArrayBuffer): void {
    const env = this.parseEnvelope(topic, payload);
    if (!env) return;
    const current = env.current as Record<string, unknown> | undefined;
    if (!current) return;
    const v = typeof current.version === 'number' ? current.version : 0;
    if (v > this.version) this.version = v;
    const currState = current.state as Record<string, unknown> | undefined;
    const currDesired = currState?.desired;
    if (currDesired === undefined) return;
    // Skip when desired didn't change vs previous — our own publishReported
    // would otherwise loop us back through apply forever.
    const prev = env.previous as Record<string, unknown> | undefined;
    const prevState = prev?.state as Record<string, unknown> | undefined;
    const prevDesired = prevState?.desired;
    if (JSON.stringify(currDesired) === JSON.stringify(prevDesired)) return;
    void this.applyAndReport(currDesired, true);
  }
}

export default ConfigShadow;

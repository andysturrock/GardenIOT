import schedule from 'node-schedule';
import AWSConnection from './aws-connection';

import mqttLogger from './mqtt-logger';

import Relay from './relay';
import ShadowRelay from './shadow-relay';

import ConfigShadow from './config-shadow';
import WateringPlan from './watering-plan';

const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const RELAY_IDS = [Relay.RELAY1, Relay.RELAY2, Relay.RELAY3, Relay.RELAY4];

async function main() {
  let relays: ShadowRelay[] = [];
  let awsConnection: AWSConnection | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  let wateringPlan: WateringPlan | undefined;
  let configShadow: ConfigShadow | undefined;
  try {
    awsConnection = new AWSConnection();
    await awsConnection.connect();
    await mqttLogger.init(awsConnection);
    const logger = mqttLogger.logger;

    logger.info('GardenIOT starting up...');

    // Relay ids are 1..4 in the config schema; the array index matches.
    relays = RELAY_IDS.map((id, i) => new ShadowRelay(id, awsConnection!, i + 1));
    const relaysById = new Map<number, ShadowRelay>(
      relays.map((r, i) => [i + 1, r]),
    );
    wateringPlan = new WateringPlan(relaysById);

    // Best-effort shutdown: attempt to publish reported-closed and
    // disconnect cleanly. Used for SIGINT / SIGTERM / SIGHUP.
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Caught ${signal}, force-closing relays and disconnecting from AWS.`);
      try { await mqttLogger.userInfo('GardenIOT offline (graceful)'); } catch (e) {
        logger.error(`userInfo offline threw: ${e}`);
      }
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined; }
      try {
        if (wateringPlan) await wateringPlan.shutdown();
      } catch (e) { logger.error(`wateringPlan.shutdown threw: ${e}`); }
      try {
        await schedule.gracefulShutdown();
      } catch (e) { logger.error(`schedule.gracefulShutdown threw: ${e}`); }
      try {
        if (configShadow) await configShadow.dispose();
      } catch (e) { logger.error(`configShadow.dispose threw: ${e}`); }
      await Promise.allSettled(relays.map((r) => r.forceClose()));
      await Promise.allSettled(relays.map((r) => r.dispose()));
      try { await awsConnection!.publishOffline(); } catch (e) {
        logger.error(`awsConnection.publishOffline threw: ${e}`);
      }
      try { await awsConnection!.disconnect(); } catch (e) {
        logger.error(`awsConnection.disconnect threw: ${e}`);
      }
      process.exit(0);
    };

    // Fatal-error shutdown: skip MQTT, just slam every GPIO pin closed.
    const emergencyShutdown = async (label: string, err: unknown) => {
      logger.error(`${label}: ${err instanceof Error ? err.stack : JSON.stringify(err)}`);
      await Promise.allSettled(relays.map((r) => r.emergencyClose()));
      process.exit(1);
    };

    process.on('SIGINT',  () => { void gracefulShutdown('SIGINT'); });
    process.on('SIGTERM', () => { void gracefulShutdown('SIGTERM'); });
    process.on('SIGHUP',  () => { void gracefulShutdown('SIGHUP'); });
    process.on('uncaughtException',  (err) => { void emergencyShutdown('uncaughtException', err); });
    process.on('unhandledRejection', (err) => { void emergencyShutdown('unhandledRejection', err); });

    await Promise.all(relays.map((r) => r.init()));

    // The config shadow drives the watering plan. On first ever boot
    // it'll seed the shadow with defaultGardenConfig (Greenhouse/Flowers
    // /Strawberries/Sweetcorn + 08:00/08:10 morning jobs). On subsequent
    // boots it picks up whatever the app has written.
    configShadow = new ConfigShadow(awsConnection, (cfg) => {
      wateringPlan!.apply(cfg);
    });
    // Bed name resolvers read configShadow at log time, so user-facing
    // log lines pick up renames the moment a new config is applied.
    relays.forEach((r, i) => {
      const configId = i + 1;
      r.setBedNameResolver(() => configShadow!.config?.beds[String(configId)]?.name);
    });
    await configShadow.init();

    // Announce we're up and start the heartbeat. AWS-side alarms can
    // page off this topic going stale (audit C3).
    await awsConnection.publishOnline();
    heartbeatTimer = setInterval(() => {
      void awsConnection!.publishOnline().catch((e) =>
        logger.error(`heartbeat publish failed: ${e}`));
    }, HEARTBEAT_INTERVAL_MS);

    logger.info('GardenIOT running...');
    void mqttLogger.userInfo('GardenIOT online');
  } catch (error) {
    if(error instanceof Error) {
      console.error(`Error: ${error.stack}`);
    } else {
      console.error(`Error: ${JSON.stringify(error)}`);
    }
    // Best-effort cleanup on startup failure: close any relays we
    // already constructed, even though they may not have had GPIO
    // initialised yet (the underlying close is idempotent).
    await Promise.allSettled(relays.map((r) => r.emergencyClose().catch(() => undefined)));
    process.exit(1);
  }
}

main();

import schedule from 'node-schedule';
import AWSConnection from './aws-connection';

import mqttLogger from './mqtt-logger';

import Relay from './relay';
import ShadowRelay from './shadow-relay';

import WateringJob from './watering-job';
import WateringPlan from './watering-plan';

const TIMEZONE = 'Europe/London';
const WATERING_DURATION_SECONDS = 60 * 5;
const HEARTBEAT_INTERVAL_MS = 60 * 1000;
const RELAY_IDS = [Relay.RELAY1, Relay.RELAY2, Relay.RELAY3, Relay.RELAY4];

async function main() {
  let relays: ShadowRelay[] = [];
  let awsConnection: AWSConnection | undefined;
  let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
  try {
    awsConnection = new AWSConnection();
    await awsConnection.connect();
    await mqttLogger.init(awsConnection);
    const logger = mqttLogger.logger;

    logger.info('GardenIOT starting up...');

    relays = RELAY_IDS.map((id) => new ShadowRelay(id, awsConnection!));

    // Best-effort shutdown: attempt to publish reported-closed and
    // disconnect cleanly. Used for SIGINT / SIGTERM / SIGHUP.
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Caught ${signal}, force-closing relays and disconnecting from AWS.`);
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = undefined; }
      try {
        await schedule.gracefulShutdown();
      } catch (e) { logger.error(`schedule.gracefulShutdown threw: ${e}`); }
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

    const morningRule = (minute: number) => {
      const rule = new schedule.RecurrenceRule();
      rule.tz = TIMEZONE;
      rule.hour = 8;
      rule.minute = minute;
      return rule;
    };
    const wateringJob1 = new WateringJob(morningRule(0),  WATERING_DURATION_SECONDS, [relays[0], relays[1]]);
    const wateringJob2 = new WateringJob(morningRule(10), WATERING_DURATION_SECONDS, [relays[2], relays[3]]);

    // WateringPlan exists to hold the jobs together; the save/load
    // round-trip is half-built (load is never called from runtime), so
    // we don't call save here. See audit E1/E2 for the proper rewrite.
    const wateringPlan = new WateringPlan('Morning Watering');
    wateringPlan.add(wateringJob1);
    wateringPlan.add(wateringJob2);

    // Announce we're up and start the heartbeat. AWS-side alarms can
    // page off this topic going stale (audit C3).
    await awsConnection.publishOnline();
    heartbeatTimer = setInterval(() => {
      void awsConnection!.publishOnline().catch((e) =>
        logger.error(`heartbeat publish failed: ${e}`));
    }, HEARTBEAT_INTERVAL_MS);

    logger.info('GardenIOT running...');
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

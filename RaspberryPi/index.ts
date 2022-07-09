import schedule from 'node-schedule';
import 'reflect-metadata';

import mqttLogger from './mqtt-logger';

import Relay from './relay';
import WateringJob from './watering-job';
import WateringPlan from './watering-plan';

require('source-map-support').install();

async function sleep(millis : number) {
  return new Promise((resolve) => { setTimeout(resolve, millis); });
}

async function main() {
  await mqttLogger.init();
  const logger = mqttLogger.logger;

  logger.info('GardenIOT starting up...');

  try {
    const relay1 = new Relay(Relay.RELAY1);
    const relay2 = new Relay(Relay.RELAY2);
    const relay3 = new Relay(Relay.RELAY3);
    const relay4 = new Relay(Relay.RELAY4);

    // Turn off all the relays if we are being killed by SIGINT
    process.on('SIGINT', async () => {
      logger.info('Caught SIGINT, turned relays off and disconnecting from AWS.');

      await schedule.gracefulShutdown();
      await relay1.off();
      await relay2.off();
      await relay3.off();
      await relay4.off();

      // Wait for messages to be sent to AWS and relays to turn off.
      await sleep(1000);
      mqttLogger.dispose();

      process.exit();
    });

    await relay1.setup();
    await relay2.setup();
    await relay3.setup();
    await relay4.setup();

    const rule = new schedule.RecurrenceRule();
    rule.dayOfWeek = new schedule.Range(0, 6);
    rule.hour = 8;
    rule.minute = 0;
    const wateringJob = new WateringJob(rule, 60 * 5, [relay1, relay2]);

    const rule2 = new schedule.RecurrenceRule();
    rule2.dayOfWeek = new schedule.Range(0, 6);
    rule2.hour = 8;
    rule2.minute = 10;
    const wateringJob2 = new WateringJob(rule2, 60 * 5, [relay3, relay4]);

    const wateringPlan = new WateringPlan('Morning Watering');
    wateringPlan.add(wateringJob);
    wateringPlan.add(wateringJob2);
    await wateringPlan.save();

    logger.info('GardenIOT running...');
  } catch (error) {
    logger.error(error);
  }
}

main();

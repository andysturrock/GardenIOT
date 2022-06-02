import schedule from 'node-schedule';
import AWSConnection from './aws-connection';

import mqttLogger from './mqtt-logger';

import Relay from './relay';
import WateringJob from './watering-job';
import WateringPlan from './watering-plan';

require('source-map-support').install();

const connection = new AWSConnection();

async function sleep(millis : number) {
  return new Promise((resolve) => { setTimeout(resolve, millis); });
}

async function main() {
  await mqttLogger.init();

  const relay1 = new Relay(Relay.RELAY1);
  const relay2 = new Relay(Relay.RELAY2);
  const relay3 = new Relay(Relay.RELAY3);
  const relay4 = new Relay(Relay.RELAY4);

  // Turn off all the relays if we are being killed by SIGINT
  process.on('SIGINT', async () => {
    await mqttLogger.info('Caught SIGINT, turned relays off and disconnecting from AWS.');

    await schedule.gracefulShutdown();
    await relay1.off();
    await relay2.off();
    await relay3.off();
    await relay4.off();

    await connection.disconnect();
    // Shouldn't be necessary, but just in case, pause to give relays time to switch off.
    await sleep(500);
    process.exit();
  });

  await relay1.setup();
  await relay2.setup();
  await relay3.setup();
  await relay4.setup();

  const rule = new schedule.RecurrenceRule();
  rule.minute = new schedule.Range(0, 59);
  const wateringJob = new WateringJob(rule, 10, [relay1, relay2]);

  const wateringPlan = new WateringPlan('testplan');
  wateringPlan.add(wateringJob);
  await wateringPlan.save();

  await mqttLogger.info('GardenIOT starting up...');
}

main();

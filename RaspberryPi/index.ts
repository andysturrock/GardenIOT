import schedule from 'node-schedule';
import 'reflect-metadata';
import AWSConnection from './aws-connection';

import mqttLogger from './mqtt-logger';

import Relay from './relay';
import ShadowRelay from './shadow-relay';

import WateringJob from './watering-job';
import WateringPlan from './watering-plan';

require('source-map-support').install();

async function sleep(millis : number) {
  return new Promise((resolve) => { setTimeout(resolve, millis); });
}

async function main() {
  const awsConnection = new AWSConnection();
  await awsConnection.connect();
  await mqttLogger.init(awsConnection);
  const logger = mqttLogger.logger;

  logger.info('GardenIOT starting up...');

  try {
    const relay1 = new ShadowRelay(Relay.RELAY1, awsConnection);
    const relay2 = new ShadowRelay(Relay.RELAY2, awsConnection);
    const relay3 = new ShadowRelay(Relay.RELAY3, awsConnection);
    const relay4 = new ShadowRelay(Relay.RELAY4, awsConnection);

    // Turn off all the relays if we are being killed by SIGINT
    process.on('SIGINT', async () => {
      logger.info('Caught SIGINT, turned relays off and disconnecting from AWS.');

      await schedule.gracefulShutdown();
      await relay1.close();
      await relay2.close();
      await relay3.close();
      await relay4.close();

      // Wait for messages to be sent to AWS and relays to close.
      await sleep(1000);
      await awsConnection.disconnect();

      process.exit();
    });

    await relay1.init();
    await relay2.init();
    await relay3.init();
    await relay4.init();

    // const rule = new schedule.RecurrenceRule();
    // rule.second = 30;
    // const wateringJob = new WateringJob(rule, 5, [relay1, relay2]);

    // const wateringPlan = new WateringPlan('Test Watering Every 30 secs for 5 secs');
    // wateringPlan.add(wateringJob);
    // await wateringPlan.save();

    

    logger.info('GardenIOT running...');

    for(let i=0; i < 10; ++i) {
      await relay1.open();
      await sleep(5000);
      await relay1.close();
    }

    
  } catch (error) {
    if(error instanceof Error) {
      console.error(`Error: ${error.stack}`);
    } else {
      console.error(`Error: ${JSON.stringify(error)}`);
    }
  }
}

main();
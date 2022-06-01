import { AWSConnection } from './aws-connection';

import { Logger } from './logger';

import { Relay } from './relay';

require('source-map-support').install();
const { CronJob } = require('cron');

const connection = new AWSConnection();
const logger = new Logger(connection);

async function sleep(millis : number) {
  return new Promise((resolve) => setTimeout(resolve, millis));
}

async function relayOn(relay: Relay) {
  relay.on();
  await logger.info(`Relay ${relay.name} (pin ${relay.id}) on.`);
}

async function relayOff(relay: Relay) {
  relay.off();
  await logger.info(`Relay ${relay.name} (pin ${relay.id}) off.`);
}

async function main() {
  const relay1 = new Relay(Relay.RELAY1);
  const relay2 = new Relay(Relay.RELAY2);
  const relay3 = new Relay(Relay.RELAY3);
  const relay4 = new Relay(Relay.RELAY4);

  // Turn off all the relays if we are being killed by SIGINT
  process.on('SIGINT', async () => {
    await relayOff(relay1);
    await relayOff(relay2);
    await relayOff(relay3);
    await relayOff(relay4);

    await logger.info('Caught SIGINT, turned relays off and disconnecting from AWS.');
    await connection.disconnect();
    // Shouldn't be necessary, but just in case, pause to give relays time to switch off.
    await sleep(500);
    process.exit();
  });

  await relay1.setup();
  await relay2.setup();
  await relay3.setup();
  await relay4.setup();

  const onJob = new CronJob(
    '1 * * * * *',
    () => relayOn(relay1),
  );

  onJob.start();

  const offJob = new CronJob(
    '31 * * * * *',
    () => relayOff(relay1),
  );

  offJob.start();

  await connection.connect();

  await logger.info('GardenIOT starting up...');
}

main();

require('source-map-support').install();
const CronJob = require('cron').CronJob;

import { Relay } from "./relay";
// Global so we can access in the SIGINT handler
const relay1 = new Relay(Relay.RELAY1);
const relay2 = new Relay(Relay.RELAY2);
const relay3 = new Relay(Relay.RELAY3);
const relay4 = new Relay(Relay.RELAY4);


// Turn off all the relays if we are being killed by SIGINT
process.on('SIGINT', async () => {
  await relay1.off();
  await relay2.off();
  await relay3.off();
  await relay4.off();
  console.log('Caught SIGINT, turned relays off.');
  // Shouldn't be necessary, but just in case, pause to give relays time to switch off.
  await sleep(500);
  process.exit();
});

async function sleep(millis : number) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

function relayOn(relay: Relay) {
  relay.on();
  console.log(`Turning on relay ${relay.name()} (pin ${relay.id()})...`);
}

function relayOff(relay: Relay) {
  relay.off();
  console.log(`Turning off relay ${relay.name()} (pin ${relay.id()})...`);
}

async function main() {

  await relay1.setup();
  await relay2.setup();
  await relay3.setup();
  await relay4.setup();

  const onJob = new CronJob(
    '1 * * * * *',
    () => relayOn(relay1)
  )

  onJob.start();

  const offJob = new CronJob(
    '31 * * * * *',
    () => relayOff(relay1)
  )

  offJob.start();
}

main();
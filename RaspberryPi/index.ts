require('source-map-support').install();

import { Relay } from "./relay";

async function sleep(millis : number) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

async function main() {
    const relay = new Relay(Relay.RELAY1);
    await relay.setup();
    while(true) {
      await relay.on();
      await sleep(1000);
      await relay.off();
      await sleep(1000);
    }
}

main();
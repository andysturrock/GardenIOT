require('source-map-support').install();
const CronJob = require('cron').CronJob;

import dotenv from "dotenv";
dotenv.config({debug: true});

const awscrt = require('aws-crt');
const iot = awscrt.iot;
const mqtt = awscrt.mqtt;

const certFile = process.env.CERTFILE;
const keyFile = process.env.KEYFILE;
const caFile = process.env.CAFILE;
const config_builder = iot.AwsIotMqttConnectionConfigBuilder.new_mtls_builder_from_path(certFile, keyFile);
config_builder.with_certificate_authority_from_path(undefined, caFile);
config_builder.with_clean_session(false);
const clientId = process.env.CLIENTID;
config_builder.with_client_id(clientId);
const endpoint = process.env.ENDPOINT;
config_builder.with_endpoint(endpoint);
const config = config_builder.build();

const client = new mqtt.MqttClient();
const connection = client.new_connection(config);
const topic = process.env.TOPIC;

import { Relay } from "./relay";
// Global so we can access in the SIGINT handler
const relay1 = new Relay(Relay.RELAY1);
const relay2 = new Relay(Relay.RELAY2);
const relay3 = new Relay(Relay.RELAY3);
const relay4 = new Relay(Relay.RELAY4);

let sequence = 1;
async function statusMessage(message: string) {
  const msg = {
    message: message,
    sequence: sequence++,
  };
  const json = JSON.stringify(msg);
  const res = await connection.publish(topic, json, mqtt.QoS.AtLeastOnce);
  console.log(`res = ${JSON.stringify(res)}`);
}


// Turn off all the relays if we are being killed by SIGINT
process.on('SIGINT', async () => {
  await relayOff(relay1);
  await relayOff(relay2);
  await relayOff(relay3);
  await relayOff(relay4);
  
  await statusMessage('Caught SIGINT, turned relays off and disconnecting from AWS.');
  await connection.disconnect();
  // Shouldn't be necessary, but just in case, pause to give relays time to switch off.
  await sleep(500);
  process.exit();
});

async function sleep(millis : number) {
  return new Promise(resolve => setTimeout(resolve, millis));
}

async function relayOn(relay: Relay) {
  relay.on();
  await statusMessage(`Relay ${relay.name()} (pin ${relay.id()}) on.`);
}

async function relayOff(relay: Relay) {
  relay.off();
  await statusMessage(`Relay ${relay.name()} (pin ${relay.id()}) off.`);
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

  await connection.connect();

  const message = `GardenIOT starting up...`;
  
}

main();
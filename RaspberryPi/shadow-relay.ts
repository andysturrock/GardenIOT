import mqttLogger from './mqtt-logger';
import Relay from './relay';
import { RelayId } from './relay-id';
import SerializedRelay from './serialization/serialized-relay';

const gpio = require('rpi-gpio').promise;

const logger = mqttLogger.logger;

class ShadowRelay extends Relay {

  constructor(id : RelayId) {
    super(id);
    }

  async setup() {
    await super.setup();
  }

  async open() {
    await super.open();
  }

  async close() {
    await super.close();
  }
}

export default ShadowRelay;

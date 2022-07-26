import getEnv from './getenv';
import mqttLogger from './mqtt-logger';
import { RelayId } from './relay-id';
import SerializedRelay from './serialization/serialized-relay';

import { MockGPIO } from './__tests__/mock-gpio';
const mockGPIO = getEnv('MOCK_GPIO', true);
const gpio = mockGPIO? MockGPIO : require('rpi-gpio').promise;

const logger = mqttLogger.logger;

class Relay {
  static readonly RELAY1 : RelayId = 35;

  static readonly RELAY2 : RelayId = 33;

  static readonly RELAY3 : RelayId = 31;

  static readonly RELAY4 : RelayId = 29;

  private readonly _id;

  private readonly _name : string;

  constructor(id : RelayId) {
    this._id = id;
    this._name = 'undefined';
    switch (id) {
      case Relay.RELAY1:
        this._name = 'RELAY1';
        break;
      case Relay.RELAY2:
        this._name = 'RELAY2';
        break;
      case Relay.RELAY3:
        this._name = 'RELAY3';
        break;
      case Relay.RELAY4:
        this._name = 'RELAY4';
        break;
      default:
        throw new RangeError('Invalid RelayId');
    }
  }

  async init() {
    await gpio.setup(this._id, gpio.DIR_OUT);
    await this.close();
  }

  async dispose() {
    await this.close();
  }

  async open() {
    await gpio.write(this._id, true);
    logger.info(`Relay ${this._name} (pin ${this._id}) open.`);
  }

  async close() {
    await gpio.write(this._id, false);
    logger.info(`Relay ${this._name} (pin ${this._id}) closed.`);
  }

  get id() {
    return this._id;
  }

  get name() {
    return this._name;
  }

  /**
   * Create custom JSON representation of the Relay.
   * @param {Relay} relay the Relay to serialize
   * @returns custom JSON representation that can be used by fromJSON
   */
  static toJSON(relay: Relay): SerializedRelay {
    /* eslint no-underscore-dangle: ["error", { "allow": ["_id", "_name"] }] */
    const json : SerializedRelay = {
      _id: relay._id,
    };
    return json;
  }

  /**
   * Create a Relay instance from the SerializedRelay.
   * @param {SerializedRelay} json SerializedRelay to deserialize
   * @returns new Relay instance
   */
  static fromJSON(json: SerializedRelay): Relay {
    const relay = new Relay(json._id);
    return relay;
  }
}

export default Relay;

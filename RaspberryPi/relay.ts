import getEnv from './utils/getenv';
import mqttLogger from './mqtt-logger';
import { RelayId } from './relay-id';

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

  // Mirrors the GPIO line: true => HIGH/open, false => LOW/closed. Used to
  // dedupe redundant open/close calls so onActualStateChange only fires on
  // a true edge — see [shadow-relay.ts] _open() echoing super.open() after
  // WateringJob has already opened the relay directly.
  private _isOpen = false;

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
    // Slam GPIO low directly; going via close() would no-op since _isOpen
    // already starts false, and we don't want init to fire a spurious
    // onActualStateChange('closed') notification.
    await gpio.write(this._id, false);
    this._isOpen = false;
  }

  async dispose() {
    await this.close();
  }

  async open() {
    if (this._isOpen) return;
    await gpio.write(this._id, true);
    this._isOpen = true;
    logger.info(`Relay ${this._name} (pin ${this._id}) open.`);
    await this.onActualStateChange('open');
  }

  async close() {
    if (!this._isOpen) return;
    await gpio.write(this._id, false);
    this._isOpen = false;
    logger.info(`Relay ${this._name} (pin ${this._id}) closed.`);
    await this.onActualStateChange('closed');
  }

  get id() {
    return this._id;
  }

  get name() {
    return this._name;
  }

  get isOpen() {
    return this._isOpen;
  }

  // Hook for subclasses (ShadowRelay) to emit user-facing logs when the
  // GPIO line actually transitions. Base impl is a no-op.
  protected async onActualStateChange(_state: 'open' | 'closed'): Promise<void> {
    // no-op
  }
}

export default Relay;

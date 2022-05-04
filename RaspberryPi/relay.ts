var gpio = require('rpi-gpio').promise;

type RelayId = 35 | 33 | 31 | 29;

export class Relay {
  static readonly RELAY1 : RelayId = 35;
  static readonly RELAY2 : RelayId = 33;
  static readonly RELAY3 : RelayId = 31;
  static readonly RELAY4 : RelayId = 29;

  readonly _relayId;

  constructor(relayId : RelayId) {
    this._relayId = relayId;
  }  

  async setup() {
    await gpio.setup(this._relayId, gpio.DIR_OUT);
  }

  async on() {
    await gpio.write(this._relayId, true);
  }

  async off() {
    await gpio.write(this._relayId, false);
  }
}

var gpio = require('rpi-gpio').promise;

type RelayId = 35 | 33 | 31 | 29;

export class Relay {
  static readonly RELAY1 : RelayId = 35;
  static readonly RELAY2 : RelayId = 33;
  static readonly RELAY3 : RelayId = 31;
  static readonly RELAY4 : RelayId = 29;

  private readonly _relayId;
  private  readonly _name : string;

  constructor(relayId : RelayId) {
    this._relayId = relayId;
    this._name = "undefined";
    switch(relayId) {
      case Relay.RELAY1:
        this._name = "RELAY1";
        break;
      case Relay.RELAY2:
        this._name = "RELAY2";
        break;
      case Relay.RELAY3:
        this._name = "RELAY3";
        break;
      case Relay.RELAY4:
        this._name = "RELAY4";
        break;
    }
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

  get id() {
    return this._relayId;
  }

  get name() {
    return this._name;
  }
}

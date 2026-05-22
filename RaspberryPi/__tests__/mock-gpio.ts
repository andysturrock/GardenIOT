// Stateful mock for rpi-gpio's promise API. Records every setup() and
// write() so tests can assert on the sequence of GPIO calls without
// touching real hardware.
//
// Gated via the MOCK_GPIO env var in relay.ts:
//   const gpio = mockGPIO ? MockGPIO : require('rpi-gpio').promise;

interface GpioWrite {
  pin: number;
  value: boolean;
}
interface GpioSetup {
  pin: number;
  dir: number;
}

class MockGPIO {
  static DIR_OUT = 1;
  static DIR_IN = 0;

  static writes: GpioWrite[] = [];
  static setups: GpioSetup[] = [];

  static async setup(channel: number, dir: number): Promise<void> {
    MockGPIO.setups.push({ pin: channel, dir });
  }

  static async write(channel: number, value: boolean): Promise<void> {
    MockGPIO.writes.push({ pin: channel, value });
  }

  /** Reset the call log between tests. Call in beforeEach. */
  static reset(): void {
    MockGPIO.writes = [];
    MockGPIO.setups = [];
  }

  /** Pins last-written value, or undefined if never written. */
  static lastValue(pin: number): boolean | undefined {
    for (let i = MockGPIO.writes.length - 1; i >= 0; i -= 1) {
      if (MockGPIO.writes[i].pin === pin) return MockGPIO.writes[i].value;
    }
    return undefined;
  }
}

export { MockGPIO };

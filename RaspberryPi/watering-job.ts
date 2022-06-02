import schedule from 'node-schedule';
import Relay from './relay';

type WateringJobState = 'WAITING' | 'RUNNING';

class WateringJob {
  static readonly WAITING : WateringJobState = 'WAITING';

  static readonly RUNNING : WateringJobState = 'RUNNING';

  private readonly _duration;

  private _state : WateringJobState;

  private readonly _rule;

  private readonly job;

  private readonly _relays;

  /**
   * Create a schedule job.
   *
   * @param rule     scheduling info from node-schedule
   * @param duration duration in seconds
   * @param relays   relays to turn on and off
   */
  constructor(rule: schedule.RecurrenceRule, duration: number, relays: Relay[]) {
    this._rule = rule;
    this._duration = duration;
    this._relays = relays;
    this._state = WateringJob.WAITING;

    this.job = schedule.scheduleJob(this._rule, this.startWatering.bind(this));
  }

  get rule() {
    return this._rule;
  }

  get duration() {
    return this._duration;
  }

  get relays() {
    return this._relays;
  }

  get state() {
    return this._state;
  }

  cancel() {
    return this.job.cancel();
  }

  private startWatering(): void {
    const stopDate = new Date(Date.now() + this._duration * 1000);
    schedule.scheduleJob(stopDate, this.stopWatering.bind(this));
    this._state = WateringJob.RUNNING;
    this._relays.forEach((relay) => relay.on());
  }

  private stopWatering() {
    this._state = WateringJob.WAITING;
    this._relays.forEach((relay) => relay.off());
  }
}

export default WateringJob;

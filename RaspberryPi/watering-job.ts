import schedule from 'node-schedule';
import Relay from './relay';
import SerializedRecurrenceRule from './serialization/serialized-recurrence-rule';
import SerializedWateringJob from './serialization/serialized-watering-job';

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
   * Create a WateringJob.
   *
   * @param rule     scheduling rule from node-schedule
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

  /**
   * Create custom JSON representation of the WateringJob.
   * @param {WateringJob} WateringJob job to serialize
   * @returns custom JSON representation that can be used by fromJSON
   */
  static toJSON(wateringJob: WateringJob) {
    /* eslint no-underscore-dangle:
      ["error", { "allow": ["_rule", "_duration", "_relays", "_state"] }]
    */
    const serializedRecurrenceRule : SerializedRecurrenceRule = {
      ...wateringJob._rule,
    };
    const json : SerializedWateringJob = {
      _rule: serializedRecurrenceRule,
      _duration: wateringJob._duration,
      _relays: wateringJob._relays.map((relay) => Relay.toJSON(relay)),
    };
    return json;
  }
}

export default WateringJob;
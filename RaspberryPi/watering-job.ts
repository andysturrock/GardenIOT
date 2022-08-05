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
    this._relays.forEach((relay) => relay.open());
  }
  
  private stopWatering() {
    this._state = WateringJob.WAITING;
    this._relays.forEach((relay) => relay.close());
  }
  
  /**
  * Create custom JSON representation of the WateringJob.
  * @param {WateringJob} wateringJob the WateringJob to serialize
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
  
  /**
  * Create a WateringJob instance from the SerializedWateringJob.
  * @param {SerializedWateringJob} json SerializedWateringJob to deserialize
  * @returns new WateringJob instance
  */
  static fromJSON(json: SerializedWateringJob): WateringJob {
    const rule = new schedule.RecurrenceRule(
      json._rule.year,
      json._rule.month,
      json._rule.date,
      json._rule.dayOfWeek,
      json._rule.hour,
      json._rule.minute,
      json._rule.second,
      json._rule.tz,  // This doesn't seem to work, so set by hand below.
    );
    if(json._rule.tz) {
      rule.tz = json._rule.tz!;
    }
    const relays = json._relays.map(relay => {return Relay.fromJSON(relay)});

    const wateringJob = new WateringJob(rule, json._duration, relays);
    return wateringJob;
  }
}

export default WateringJob;

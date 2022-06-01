import schedule from 'node-schedule';

type WateringJobState = "WAITING" | "RUNNING";

export class WateringJob {
  static readonly WAITING : WateringJobState = "WAITING";
  static readonly RUNNING : WateringJobState = "RUNNING";

  private readonly _duration;
  private readonly _state : WateringJobState;

  private readonly _rule;
  private readonly _job;

  constructor(duration: number) {
    this._duration = duration;
    this._state = WateringJob.WAITING;

    this._rule = new schedule.RecurrenceRule();
    this._job = schedule.scheduleJob(this._rule, this._startWatering);
  }

  get duration() {
    return this._duration;
  }

  get state() {
    return this._state;
  }

  cancel() {
    return this._job.cancel();
  }

  private _startWatering() {
    
  }
}

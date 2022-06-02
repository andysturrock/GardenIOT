import schedule from 'node-schedule';

type WateringJobState = 'WAITING' | 'RUNNING';

class WateringJob {
  static readonly WAITING : WateringJobState = 'WAITING';

  static readonly RUNNING : WateringJobState = 'RUNNING';

  private readonly _duration;

  private _state : WateringJobState;

  private readonly rule;

  private readonly job;

  constructor(duration: number) {
    this._duration = duration;
    this._state = WateringJob.WAITING;

    this.rule = new schedule.RecurrenceRule();
    this.job = schedule.scheduleJob(this.rule, this.startWatering);
  }

  get duration() {
    return this._duration;
  }

  get state() {
    return this._state;
  }

  cancel() {
    return this.job.cancel();
  }

  private startWatering(): void {
    this._state = WateringJob.RUNNING;
  }
}

export default WateringJob;

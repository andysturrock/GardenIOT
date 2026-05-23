import schedule from 'node-schedule';
import mqttLogger from './mqtt-logger';
import Relay from './relay';
import ShadowRelay from './shadow-relay';

const logger = mqttLogger.logger;

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

    this.job = schedule.scheduleJob(this._rule, () => { void this.startWatering(); });
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

  private async startWatering(): Promise<void> {
    this._state = WateringJob.RUNNING;
    // Schedule the stop FIRST as a safety net. Even if some opens fail
    // below, the stop will still try to close every relay.
    const stopDate = new Date(Date.now() + this._duration * 1000);
    schedule.scheduleJob(stopDate, () => { void this.stopWatering(); });

    const results = await Promise.allSettled(this._relays.map((r) => r.open()));
    const failures = results.filter((r) => r.status === 'rejected');
    if (failures.length === 0) return;

    logger.error(`startWatering: ${failures.length}/${this._relays.length} relay opens failed`);
    for (const f of failures) {
      if (f.status === 'rejected') logger.error(`  ${f.reason}`);
    }
    // Best-effort emergency close on every relay. The scheduled stop
    // above will run regardless, so this is belt-and-braces.
    await Promise.allSettled(this._relays.map((r) =>
      r instanceof ShadowRelay ? r.emergencyClose() : r.close(),
    ));
  }

  private async stopWatering(): Promise<void> {
    this._state = WateringJob.WAITING;
    const results = await Promise.allSettled(this._relays.map((r) =>
      r instanceof ShadowRelay ? r.forceClose() : r.close(),
    ));
    for (const result of results) {
      if (result.status === 'rejected') {
        logger.error(`stopWatering: relay close failed: ${result.reason}`);
      }
    }
  }
}

export default WateringJob;

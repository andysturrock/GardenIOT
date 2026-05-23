import schedule from 'node-schedule';
import mqttLogger from './mqtt-logger';
import ShadowRelay from './shadow-relay';
import WateringJob from './watering-job';
import {
  GardenConfig,
  WateringJobConfig,
} from './serialization/garden-config';

const logger = mqttLogger.logger;

export type WateringJobFactory = (
  rule: schedule.RecurrenceRule,
  duration: number,
  relays: ShadowRelay[],
) => WateringJob;

const defaultFactory: WateringJobFactory = (rule, duration, relays) =>
  new WateringJob(rule, duration, relays);

/**
 * Convert an ISO weekday (1=Mon..7=Sun) into a node-schedule
 * dayOfWeek value (0=Sun..6=Sat). Exported for testing.
 */
export function isoToNodeScheduleDay(iso: number): number {
  return iso % 7;
}

/**
 * Owns the set of scheduled WateringJobs. Re-derives the job list every
 * time a new GardenConfig arrives. No filesystem persistence — the
 * config shadow is the source of truth (see config-shadow.ts).
 */
class WateringPlan {
  private readonly relaysById: Map<number, ShadowRelay>;
  private readonly factory: WateringJobFactory;
  private jobs: WateringJob[] = [];
  private currentJobsKey: string | null = null;

  constructor(relaysById: Map<number, ShadowRelay>, factory: WateringJobFactory = defaultFactory) {
    this.relaysById = relaysById;
    this.factory = factory;
  }

  /**
   * Cancel any existing scheduled jobs and replace them with jobs built
   * from `config`. If the resulting job set matches the one already
   * running, do nothing (no churn on identical re-publishes).
   */
  apply(config: GardenConfig): void {
    const key = JSON.stringify({
      tz: config.tz,
      jobs: config.jobs.map((j) => ({
        days: j.days,
        hour: j.hour,
        minute: j.minute,
        duration_s: j.duration_s,
        relays: j.relays,
      })),
    });
    if (key === this.currentJobsKey) {
      logger.debug('WateringPlan: config unchanged; no reschedule');
      return;
    }
    this.cancelAll();
    const scheduled: WateringJob[] = [];
    for (const cfg of config.jobs) {
      try {
        scheduled.push(this.buildJob(cfg, config.tz));
      } catch (e) {
        logger.error(`WateringPlan: skipping job "${cfg.id}": ${e}`);
      }
    }
    this.jobs = scheduled;
    this.currentJobsKey = key;
    logger.info(`WateringPlan: applied ${this.jobs.length}/${config.jobs.length} job(s)`);
  }

  /**
   * Cancel every scheduled job. Safe to call multiple times. Returns a
   * resolved promise so callers can `await` it from shutdown handlers.
   */
  async shutdown(): Promise<void> {
    this.cancelAll();
    this.currentJobsKey = null;
  }

  get scheduledJobCount(): number {
    return this.jobs.length;
  }

  private cancelAll(): void {
    for (const job of this.jobs) {
      try {
        job.cancel();
      } catch (e) {
        logger.warn(`WateringPlan: cancel failed: ${e}`);
      }
    }
    this.jobs = [];
  }

  private buildJob(cfg: WateringJobConfig, tz: string): WateringJob {
    const rule = new schedule.RecurrenceRule();
    rule.tz = tz;
    rule.hour = cfg.hour;
    rule.minute = cfg.minute;
    rule.dayOfWeek = cfg.days.map(isoToNodeScheduleDay);

    const relays: ShadowRelay[] = [];
    for (const id of cfg.relays) {
      const relay = this.relaysById.get(id);
      if (!relay) {
        throw new Error(`unknown relay id ${id}`);
      }
      relays.push(relay);
    }
    return this.factory(rule, cfg.duration_s, relays);
  }
}

export default WateringPlan;

import { describe, test, expect, beforeEach, vi } from 'vitest';
import schedule from 'node-schedule';
import WateringPlan, { isoToNodeScheduleDay, WateringJobFactory } from '../watering-plan';
import WateringJob from '../watering-job';
import ShadowRelay from '../shadow-relay';
import { GardenConfig, defaultGardenConfig } from '../serialization/garden-config';

function fakeRelay(id: number): ShadowRelay {
  return { id } as unknown as ShadowRelay;
}

function relayMap(ids: number[]): Map<number, ShadowRelay> {
  return new Map(ids.map((id) => [id, fakeRelay(id)]));
}

interface ScheduledCall {
  rule: schedule.RecurrenceRule;
  duration: number;
  relays: ShadowRelay[];
  name: string;
  relayIds: number[];
  job: { cancel: ReturnType<typeof vi.fn> };
}

function makeFactory(): { factory: WateringJobFactory; calls: ScheduledCall[] } {
  const calls: ScheduledCall[] = [];
  const factory: WateringJobFactory = (rule, duration, relays, name, relayIds) => {
    const job = { cancel: vi.fn(() => true) };
    calls.push({ rule, duration, relays, name, relayIds, job });
    return job as unknown as WateringJob;
  };
  return { factory, calls };
}

describe('isoToNodeScheduleDay', () => {
  test('Mon..Sat round-trip identity', () => {
    expect(isoToNodeScheduleDay(1)).toBe(1);
    expect(isoToNodeScheduleDay(2)).toBe(2);
    expect(isoToNodeScheduleDay(3)).toBe(3);
    expect(isoToNodeScheduleDay(4)).toBe(4);
    expect(isoToNodeScheduleDay(5)).toBe(5);
    expect(isoToNodeScheduleDay(6)).toBe(6);
  });

  test('Sunday (ISO 7) maps to node-schedule 0', () => {
    expect(isoToNodeScheduleDay(7)).toBe(0);
  });
});

describe('WateringPlan', () => {
  let factory: WateringJobFactory;
  let calls: ScheduledCall[];
  let plan: WateringPlan;

  beforeEach(() => {
    ({ factory, calls } = makeFactory());
    plan = new WateringPlan(relayMap([1, 2, 3, 4]), factory);
  });

  test('apply() schedules one job per config.jobs entry', () => {
    plan.apply(defaultGardenConfig());
    expect(calls).toHaveLength(2);
    expect(plan.scheduledJobCount).toBe(2);
  });

  test('apply() forwards duration and resolves relay ids to ShadowRelay instances', () => {
    plan.apply(defaultGardenConfig());
    expect(calls[0].duration).toBe(600);
    expect(calls[1].duration).toBe(900);
    expect(calls[0].relays.map((r) => (r as unknown as { id: number }).id)).toEqual([1, 2]);
    expect(calls[1].relays.map((r) => (r as unknown as { id: number }).id)).toEqual([3, 4]);
  });

  test('apply() builds rules with the right hour, minute, tz, dayOfWeek mapping', () => {
    plan.apply(defaultGardenConfig());
    const rule = calls[0].rule;
    expect(rule.tz).toBe('Europe/London');
    expect(rule.hour).toBe(8);
    expect(rule.minute).toBe(0);
    // Mon..Sun in ISO → 1..6,0 in node-schedule
    expect(rule.dayOfWeek).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  test('apply() forwards job name and logical relay ids to the factory', () => {
    plan.apply(defaultGardenConfig());
    expect(calls[0].name).toBe('Morning veg');
    expect(calls[0].relayIds).toEqual([1, 2]);
    expect(calls[1].name).toBe('Morning fruit');
    expect(calls[1].relayIds).toEqual([3, 4]);
  });

  test('apply() falls back to the job id when name is absent', () => {
    const cfg: GardenConfig = {
      ...defaultGardenConfig(),
      jobs: [
        {
          id: 'unnamed-job-42',
          days: [1],
          hour: 6,
          minute: 0,
          duration_s: 30,
          relays: [1],
        },
      ],
    };
    plan.apply(cfg);
    expect(calls[calls.length - 1].name).toBe('unnamed-job-42');
  });

  test('apply() twice with identical config is a no-op (no churn)', () => {
    plan.apply(defaultGardenConfig());
    plan.apply(defaultGardenConfig());
    expect(calls).toHaveLength(2);
    // Existing jobs still scheduled, none cancelled
    for (const c of calls) expect(c.job.cancel).not.toHaveBeenCalled();
  });

  test('apply() with a different config cancels old jobs and schedules new ones', () => {
    plan.apply(defaultGardenConfig());
    const firstCalls = [...calls];
    const altered: GardenConfig = {
      ...defaultGardenConfig(),
      jobs: [
        {
          id: 'evening',
          name: 'Evening',
          days: [1, 3, 5],
          hour: 19,
          minute: 30,
          duration_s: 120,
          relays: [1],
        },
      ],
    };

    plan.apply(altered);
    for (const c of firstCalls) expect(c.job.cancel).toHaveBeenCalledOnce();
    expect(plan.scheduledJobCount).toBe(1);
    const newCall = calls[calls.length - 1];
    expect(newCall.duration).toBe(120);
    expect(newCall.rule.dayOfWeek).toEqual([1, 3, 5]);
  });

  test('apply() skips jobs that reference an unknown relay id but keeps valid ones', () => {
    const cfg: GardenConfig = {
      ...defaultGardenConfig(),
      jobs: [
        {
          id: 'bad',
          days: [1],
          hour: 8,
          minute: 0,
          duration_s: 60,
          relays: [99],
        },
        {
          id: 'good',
          days: [1],
          hour: 8,
          minute: 0,
          duration_s: 60,
          relays: [1],
        },
      ],
    };
    plan.apply(cfg);
    expect(plan.scheduledJobCount).toBe(1);
    expect(calls[calls.length - 1].relays.map((r) => (r as unknown as { id: number }).id)).toEqual([1]);
  });

  test('apply() handles factory throws by logging and continuing', () => {
    const throwingFactory: WateringJobFactory = () => {
      throw new Error('boom');
    };
    const p = new WateringPlan(relayMap([1, 2, 3, 4]), throwingFactory);
    p.apply(defaultGardenConfig());
    expect(p.scheduledJobCount).toBe(0);
  });

  test('shutdown() cancels every scheduled job', async () => {
    plan.apply(defaultGardenConfig());
    const before = [...calls];
    await plan.shutdown();
    for (const c of before) expect(c.job.cancel).toHaveBeenCalledOnce();
    expect(plan.scheduledJobCount).toBe(0);
  });

  test('shutdown() then apply() reschedules from a clean state', async () => {
    plan.apply(defaultGardenConfig());
    await plan.shutdown();
    plan.apply(defaultGardenConfig());
    // 2 from first apply + 2 from second
    expect(calls).toHaveLength(4);
  });

  test('cancel failure during apply() is logged but does not break the reschedule', () => {
    const throwingFactory: WateringJobFactory = (rule, duration, relays, name, relayIds) => {
      const j = { cancel: vi.fn(() => { throw new Error('cancel fail'); }) };
      calls.push({ rule, duration, relays, name, relayIds, job: j });
      return j as unknown as WateringJob;
    };
    const p = new WateringPlan(relayMap([1, 2, 3, 4]), throwingFactory);
    p.apply(defaultGardenConfig());

    const altered: GardenConfig = {
      ...defaultGardenConfig(),
      jobs: [
        { id: 'x', days: [1], hour: 6, minute: 0, duration_s: 30, relays: [1] },
      ],
    };
    expect(() => p.apply(altered)).not.toThrow();
    expect(p.scheduledJobCount).toBe(1);
  });

  test('default factory builds a real WateringJob', () => {
    const planNoFactory = new WateringPlan(relayMap([1, 2, 3, 4]));
    const scheduleJobSpy = vi.spyOn(schedule, 'scheduleJob');
    scheduleJobSpy.mockReturnValue({ cancel: () => true } as unknown as schedule.Job);
    planNoFactory.apply(defaultGardenConfig());
    expect(planNoFactory.scheduledJobCount).toBe(2);
    scheduleJobSpy.mockRestore();
  });
});

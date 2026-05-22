import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs/promises';
import schedule from 'node-schedule';
import WateringPlan from '../watering-plan';
import WateringJob from '../watering-job';
import Relay from '../relay';

function buildJob(): WateringJob {
  const rule = new schedule.RecurrenceRule();
  rule.hour = 8;
  rule.tz = 'Europe/London';
  return new WateringJob(rule, 60, [new Relay(Relay.RELAY1)]);
}

describe('WateringPlan', () => {
  beforeEach(() => {
    // node-schedule.scheduleJob would otherwise leave timers behind.
    const job = { cancel: () => true } as unknown as schedule.Job;
    vi.spyOn(schedule, 'scheduleJob').mockReturnValue(job);
  });

  test('constructor stores the name', () => {
    const p = new WateringPlan('Morning');
    expect(p.name).toBe('Morning');
  });

  test('add() accumulates jobs reachable via JSON', () => {
    const p = new WateringPlan('Plan');
    p.add(buildJob());
    p.add(buildJob());

    const json = WateringPlan.toJSON(p);
    expect(json._jobs).toHaveLength(2);
  });

  test('clearJobs() empties the job list', () => {
    const p = new WateringPlan('Plan');
    p.add(buildJob());
    p.clearJobs();

    const json = WateringPlan.toJSON(p);
    expect(json._jobs).toHaveLength(0);
  });

  test('JSON round-trip preserves name and jobs', () => {
    const original = new WateringPlan('Round');
    original.add(buildJob());
    original.add(buildJob());

    const restored = WateringPlan.fromJSON(WateringPlan.toJSON(original));
    expect(restored.name).toBe('Round');
    expect(WateringPlan.toJSON(restored)._jobs).toHaveLength(2);
  });

  describe('save / load (file-store path is hardcoded — fs is mocked)', () => {
    test('save() serialises the plan and writes JSON to disk', async () => {
      const writeFile = vi.spyOn(fs, 'writeFile').mockResolvedValue();
      const p = new WateringPlan('SaveMe');
      p.add(buildJob());

      await p.save();

      expect(writeFile).toHaveBeenCalledOnce();
      const [path, contents, encoding] = writeFile.mock.calls[0];
      expect(String(path)).toContain('SaveMe');
      expect(encoding).toBe('utf8');
      const decoded = JSON.parse(String(contents));
      expect(decoded._name).toBe('SaveMe');
      expect(decoded._jobs).toHaveLength(1);
    });

    test('load() reads the file and rebuilds the plan in-place', async () => {
      const source = new WateringPlan('LoadMe');
      source.add(buildJob());
      const serialised = JSON.stringify(WateringPlan.toJSON(source));
      vi.spyOn(fs, 'readFile').mockResolvedValue(serialised);

      const target = new WateringPlan('LoadMe');
      await target.load();

      expect(WateringPlan.toJSON(target)._jobs).toHaveLength(1);
    });

    test('load() propagates errors when the file does not exist', async () => {
      vi.spyOn(fs, 'readFile').mockRejectedValue(new Error('ENOENT'));
      const p = new WateringPlan('Missing');
      await expect(p.load()).rejects.toThrow('ENOENT');
    });
  });
});

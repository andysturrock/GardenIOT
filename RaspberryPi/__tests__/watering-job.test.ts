import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import schedule from 'node-schedule';
import Relay from '../relay';
import ShadowRelay from '../shadow-relay';
import WateringJob from '../watering-job';
import mqttLogger from '../mqtt-logger';
import { MockAWSConnection } from './mock-aws-connection';
import { MockGPIO } from './mock-gpio';

function basicRule(): schedule.RecurrenceRule {
  const rule = new schedule.RecurrenceRule();
  rule.hour = 8;
  rule.minute = 0;
  rule.tz = 'Europe/London';
  return rule;
}

describe('WateringJob', () => {
  let scheduleJobSpy: ReturnType<typeof vi.spyOn>;
  let userInfoSpy: ReturnType<typeof vi.spyOn>;
  let userErrorSpy: ReturnType<typeof vi.spyOn>;

  // Single shared mock job object so multiple WateringJob constructions
  // get reference-equal `job` fields — needed for the JSON round-trip
  // test's toEqual() comparison.
  const sharedMockJob = { cancel: vi.fn(() => true) };

  beforeEach(() => {
    MockGPIO.reset();
    sharedMockJob.cancel.mockClear();
    // Spy on node-schedule.scheduleJob so we don't actually arm timers.
    scheduleJobSpy = vi.spyOn(schedule, 'scheduleJob') as any;
    scheduleJobSpy.mockReturnValue(sharedMockJob as any);
    // Silence userX emissions; ShadowRelay (not WateringJob) is the one
    // that emits them now, so we only assert *here* that WateringJob no
    // longer does. The detailed per-bed emission is covered in
    // shadow-relay.test.ts.
    userInfoSpy = vi.spyOn(mqttLogger, 'userInfo').mockResolvedValue();
    userErrorSpy = vi.spyOn(mqttLogger, 'userError').mockResolvedValue();
  });

  afterEach(() => {
    scheduleJobSpy.mockRestore();
    userInfoSpy.mockRestore();
    userErrorSpy.mockRestore();
  });

  describe('construction', () => {
    test('schedules the recurring job via node-schedule on construction', () => {
      const rule = basicRule();
      // eslint-disable-next-line no-new
      new WateringJob(rule, 60, []);
      expect(scheduleJobSpy).toHaveBeenCalledOnce();
      expect(scheduleJobSpy.mock.calls[0][0]).toBe(rule);
      expect(typeof scheduleJobSpy.mock.calls[0][1]).toBe('function');
    });

    test('exposes rule, duration, relays, and initial WAITING state via getters', () => {
      const rule = basicRule();
      const relays = [new Relay(Relay.RELAY1), new Relay(Relay.RELAY2)];
      const job = new WateringJob(rule, 300, relays);

      expect(job.rule).toBe(rule);
      expect(job.duration).toBe(300);
      expect(job.relays).toBe(relays);
      expect(job.state).toBe(WateringJob.WAITING);
    });

    test('exposes the WAITING and RUNNING state constants', () => {
      expect(WateringJob.WAITING).toBe('WAITING');
      expect(WateringJob.RUNNING).toBe('RUNNING');
    });

    test('name defaults to "unnamed" when not provided; getter exposes it', () => {
      const job = new WateringJob(basicRule(), 60, []);
      expect(job.name).toBe('unnamed');
    });

    test('name passed to constructor is exposed via getter', () => {
      const job = new WateringJob(basicRule(), 60, [], 'Morning veg');
      expect(job.name).toBe('Morning veg');
    });
  });

  describe('cancel()', () => {
    test('forwards to the underlying node-schedule job', () => {
      const job = new WateringJob(basicRule(), 60, []);
      const result = job.cancel();

      expect(sharedMockJob.cancel).toHaveBeenCalledOnce();
      expect(result).toBe(true);
    });
  });

  describe('startWatering (private, fired by the scheduler)', () => {
    /** Invoke the callback the WateringJob registered with scheduleJob. */
    function fireScheduledJob(): Promise<void> {
      const cb = scheduleJobSpy.mock.calls[0][1] as () => void;
      cb();
      // Let microtasks flush so the awaited Promise.allSettled completes
      return new Promise((r) => setImmediate(r));
    }

    test('opens every relay and transitions to RUNNING', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const r2 = new Relay(Relay.RELAY2);
      const openR1 = vi.spyOn(r1, 'open');
      const openR2 = vi.spyOn(r2, 'open');

      const job = new WateringJob(basicRule(), 60, [r1, r2]);
      await fireScheduledJob();

      expect(openR1).toHaveBeenCalledOnce();
      expect(openR2).toHaveBeenCalledOnce();
      expect(job.state).toBe(WateringJob.RUNNING);
    });

    test('does NOT emit a job-level userInfo on start (ShadowRelay does the per-bed emit)', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const r2 = new Relay(Relay.RELAY2);
      // eslint-disable-next-line no-new
      new WateringJob(basicRule(), 300, [r1, r2], 'Morning veg', [1, 2]);
      await fireScheduledJob();
      expect(userInfoSpy).not.toHaveBeenCalled();
    });

    test('schedules stopWatering at start + duration seconds', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const job = new WateringJob(basicRule(), 300, [r1]);

      const before = Date.now();
      await fireScheduledJob();
      const after = Date.now();

      // Two scheduleJob calls now: the recurring one (in constructor)
      // and the one-off stop (during startWatering).
      expect(scheduleJobSpy).toHaveBeenCalledTimes(2);
      const stopAt = scheduleJobSpy.mock.calls[1][0] as Date;
      expect(stopAt).toBeInstanceOf(Date);
      expect(stopAt.getTime()).toBeGreaterThanOrEqual(before + 300 * 1000);
      expect(stopAt.getTime()).toBeLessThanOrEqual(after + 300 * 1000);
      // Silence the job to keep test state self-contained.
      void job;
    });

    test('logs failures and emergency-closes ShadowRelays on partial open failure', async () => {
      const conn = new MockAWSConnection();
      const r1 = new ShadowRelay(Relay.RELAY1, conn as unknown as never, 1);
      const r2 = new ShadowRelay(Relay.RELAY2, conn as unknown as never, 2);
      await r1.init();
      await r2.init();
      conn.reset();
      MockGPIO.reset();

      const r2EmergencyClose = vi.spyOn(r2, 'emergencyClose');
      // Force r1.open to reject (simulate GPIO failure)
      vi.spyOn(r1, 'open').mockRejectedValueOnce(new Error('gpio fail'));

      const job = new WateringJob(basicRule(), 60, [r1, r2]);
      await fireScheduledJob();

      // Both relays attempted emergencyClose because r1 failed
      expect(r2EmergencyClose).toHaveBeenCalledOnce();
      // (r1's emergencyClose was also called; we don't double-assert)
      void job;
      await r1.dispose();
      await r2.dispose();
    });

    test('falls back to close() for plain Relays (no emergencyClose method) on partial failure', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const r2 = new Relay(Relay.RELAY2);
      vi.spyOn(r1, 'open').mockRejectedValueOnce(new Error('gpio fail'));
      // r2 must be "open" for close() to actually run (idempotent close
      // skips when already closed). Pre-open it.
      await r2.open();
      const closeR2 = vi.spyOn(r2, 'close');

      const job = new WateringJob(basicRule(), 60, [r1, r2]);
      await fireScheduledJob();

      // Plain Relay's emergency-close fallback is .close()
      expect(closeR2).toHaveBeenCalledOnce();
      void job;
    });

    test('does NOT emit a job-level userError on partial open failure (ShadowRelay watchdog does)', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const r2 = new Relay(Relay.RELAY2);
      vi.spyOn(r1, 'open').mockRejectedValueOnce(new Error('gpio fail'));

      // eslint-disable-next-line no-new
      new WateringJob(basicRule(), 60, [r1, r2], 'Morning veg', [1, 2]);
      await fireScheduledJob();

      expect(userErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe('stopWatering (private, fired by the scheduled stop)', () => {
    async function fireStart(): Promise<() => void> {
      // Run startWatering once so the stop callback is captured
      const startCb = scheduleJobSpy.mock.calls[0][1] as () => void;
      startCb();
      await new Promise((r) => setImmediate(r));
      // The stop call is the 2nd scheduleJob call
      return scheduleJobSpy.mock.calls[1][1] as () => void;
    }

    test('forceCloses ShadowRelays (publishes both reported and desired)', async () => {
      const conn = new MockAWSConnection();
      const r1 = new ShadowRelay(Relay.RELAY1, conn as unknown as never, 1);
      const r2 = new ShadowRelay(Relay.RELAY2, conn as unknown as never, 2);
      await r1.init();
      await r2.init();
      conn.reset();
      MockGPIO.reset();

      const fc1 = vi.spyOn(r1, 'forceClose');
      const fc2 = vi.spyOn(r2, 'forceClose');

      const job = new WateringJob(basicRule(), 60, [r1, r2]);
      const stopCb = await fireStart();
      stopCb();
      await new Promise((r) => setImmediate(r));

      expect(fc1).toHaveBeenCalledOnce();
      expect(fc2).toHaveBeenCalledOnce();
      expect(job.state).toBe(WateringJob.WAITING);

      await r1.dispose();
      await r2.dispose();
    });

    test('uses plain close() for non-Shadow relays', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const close1 = vi.spyOn(r1, 'close');

      const job = new WateringJob(basicRule(), 60, [r1]);
      const stopCb = await fireStart();
      stopCb();
      await new Promise((r) => setImmediate(r));

      expect(close1).toHaveBeenCalledOnce();
      void job;
    });

    test('one relay close failure does not prevent the others closing', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const r2 = new Relay(Relay.RELAY2);
      // Pre-open both so close() actually runs the GPIO path.
      await r1.open();
      await r2.open();
      vi.spyOn(r1, 'close').mockRejectedValueOnce(new Error('gpio fail'));
      const close2 = vi.spyOn(r2, 'close');

      const job = new WateringJob(basicRule(), 60, [r1, r2]);
      const stopCb = await fireStart();
      stopCb();
      await new Promise((r) => setImmediate(r));

      expect(close2).toHaveBeenCalledOnce();
      void job;
    });

    test('does NOT emit a job-level userInfo on stop (ShadowRelay does the per-bed emit)', async () => {
      const r1 = new Relay(Relay.RELAY1);
      // eslint-disable-next-line no-new
      new WateringJob(basicRule(), 60, [r1], 'Morning veg', [1]);
      const stopCb = await fireStart();
      userInfoSpy.mockClear();
      stopCb();
      await new Promise((r) => setImmediate(r));

      expect(userInfoSpy).not.toHaveBeenCalled();
    });

    test('does NOT emit a job-level userError when closes fail at stop (ShadowRelay watchdog does)', async () => {
      const r1 = new Relay(Relay.RELAY1);
      const r2 = new Relay(Relay.RELAY2);
      await r1.open();
      await r2.open();
      vi.spyOn(r1, 'close').mockRejectedValueOnce(new Error('gpio fail'));

      // eslint-disable-next-line no-new
      new WateringJob(basicRule(), 60, [r1, r2], 'Morning veg', [1, 2]);
      const stopCb = await fireStart();
      stopCb();
      await new Promise((r) => setImmediate(r));

      expect(userErrorSpy).not.toHaveBeenCalled();
    });
  });
});

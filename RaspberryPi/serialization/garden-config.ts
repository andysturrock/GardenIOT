/**
 * Shape of the `config` named shadow on the Pi Thing. App and Pi both
 * read and write to this. See docs/garden-config-shadow-plan.md for the
 * design.
 */

export const SCHEMA_VERSION = 1;

export interface BedConfig {
  name: string;
}

export interface WateringJobConfig {
  id: string;
  name?: string;
  days: number[];      // ISO weekdays, 1=Mon..7=Sun
  hour: number;        // 0..23
  minute: number;      // 0..59
  duration_s: number;  // > 0
  relays: number[];    // relay ids 1..4
}

export interface GardenConfig {
  version: number;
  beds: Record<string, BedConfig>;
  jobs: WateringJobConfig[];
  tz: string;
}

export class GardenConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GardenConfigError';
  }
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function intIn(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new GardenConfigError(`expected integer in [${min}..${max}], got ${JSON.stringify(value)}`);
  }
  return value;
}

function dedupeSorted(values: number[]): number[] {
  return Array.from(new Set(values)).sort((a, b) => a - b);
}

function parseBed(raw: unknown, key: string): BedConfig {
  if (!isObject(raw)) throw new GardenConfigError(`beds["${key}"] is not an object`);
  const name = raw.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new GardenConfigError(`beds["${key}"].name must be a non-empty string`);
  }
  return { name };
}

function wrap(path: string, fn: () => number): number {
  try {
    return fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    throw new GardenConfigError(`${path}: ${m}`);
  }
}

function parseJob(raw: unknown, index: number): WateringJobConfig {
  if (!isObject(raw)) throw new GardenConfigError(`jobs[${index}] is not an object`);

  const id = raw.id;
  if (typeof id !== 'string' || id.length === 0) {
    throw new GardenConfigError(`jobs[${index}].id must be a non-empty string`);
  }

  let name: string | undefined;
  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string') {
      throw new GardenConfigError(`jobs[${index}].name must be a string if present`);
    }
    name = raw.name;
  }

  if (!Array.isArray(raw.days)) {
    throw new GardenConfigError(`jobs[${index}].days must be an array`);
  }
  const days = dedupeSorted(
    raw.days.map((d, i) => wrap(`jobs[${index}].days[${i}]`, () => intIn(d, 1, 7))),
  );
  if (days.length === 0) {
    throw new GardenConfigError(`jobs[${index}].days must be non-empty`);
  }

  const hour = wrap(`jobs[${index}].hour`, () => intIn(raw.hour, 0, 23));
  const minute = wrap(`jobs[${index}].minute`, () => intIn(raw.minute, 0, 59));

  if (typeof raw.duration_s !== 'number' || !Number.isInteger(raw.duration_s) || raw.duration_s <= 0) {
    throw new GardenConfigError(`jobs[${index}].duration_s must be a positive integer`);
  }
  const durationS = raw.duration_s;

  if (!Array.isArray(raw.relays)) {
    throw new GardenConfigError(`jobs[${index}].relays must be an array`);
  }
  const relays = dedupeSorted(
    raw.relays.map((r, i) => wrap(`jobs[${index}].relays[${i}]`, () => intIn(r, 1, 4))),
  );
  if (relays.length === 0) {
    throw new GardenConfigError(`jobs[${index}].relays must be non-empty`);
  }

  const job: WateringJobConfig = { id, days, hour, minute, duration_s: durationS, relays };
  if (name !== undefined) job.name = name;
  return job;
}

export function parseGardenConfig(raw: unknown): GardenConfig {
  if (!isObject(raw)) throw new GardenConfigError('GardenConfig must be an object');

  if (raw.version !== SCHEMA_VERSION) {
    throw new GardenConfigError(
      `unsupported schema version: ${JSON.stringify(raw.version)} (expected ${SCHEMA_VERSION})`,
    );
  }

  if (!isObject(raw.beds)) throw new GardenConfigError('beds must be an object');
  const beds: Record<string, BedConfig> = {};
  for (const key of Object.keys(raw.beds)) {
    beds[key] = parseBed(raw.beds[key], key);
  }

  if (!Array.isArray(raw.jobs)) throw new GardenConfigError('jobs must be an array');
  const jobs = raw.jobs.map((j, i) => parseJob(j, i));

  if (typeof raw.tz !== 'string' || raw.tz.length === 0) {
    throw new GardenConfigError('tz must be a non-empty string');
  }

  return {
    version: SCHEMA_VERSION,
    beds,
    jobs,
    tz: raw.tz,
  };
}

export function defaultGardenConfig(): GardenConfig {
  return {
    version: SCHEMA_VERSION,
    beds: {
      '1': { name: 'Greenhouse' },
      '2': { name: 'Flowers' },
      '3': { name: 'Strawberries' },
      '4': { name: 'Sweetcorn' },
    },
    jobs: [
      {
        id: 'default-morning-veg',
        name: 'Morning veg',
        days: [1, 2, 3, 4, 5, 6, 7],
        hour: 8,
        minute: 0,
        duration_s: 300,
        relays: [1, 2],
      },
      {
        id: 'default-morning-fruit',
        name: 'Morning fruit',
        days: [1, 2, 3, 4, 5, 6, 7],
        hour: 8,
        minute: 10,
        duration_s: 300,
        relays: [3, 4],
      },
    ],
    tz: 'Europe/London',
  };
}

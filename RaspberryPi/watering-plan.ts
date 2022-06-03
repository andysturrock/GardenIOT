import fs from 'fs/promises';
import path from 'node:path';
import SerializedWateringPlan from './serialization/serialized-watering-plan';
import WateringJob from './watering-job';

class WateringPlan {
  private _jobs: WateringJob[] = [];

  private readonly _name;

  private static readonly fileStorePath = '/wateringplans'; // TODO Make Windows compatible

  private readonly filename;

  constructor(name: string) {
    this._name = name;
    this.filename = path.resolve(WateringPlan.fileStorePath, `wateringplan-${name}.json`);
  }

  async load() {
    const json:string = await fs.readFile(this.filename, 'utf8');
    const other : WateringPlan = WateringPlan.fromJSON(json);
    Object.assign(this, other);
  }

  async save() {
    const json = JSON.stringify(WateringPlan.toJSON(this), null, 4);
    await fs.writeFile(this.filename, json, 'utf8');
  }

  add(wateringJob: WateringJob) {
    this._jobs.push(wateringJob);
  }

  get name() {
    return this._name;
  }

  private get jobs() {
    return this._jobs;
  }

  static fromJSON(json: string) {
    const wateringPlan : WateringPlan = JSON.parse(json);
    return wateringPlan;
  }

  /**
   * Create custom JSON representation of the WateringPlan.
   * @param {WateringPlan} wateringPlan plan to serialize
   * @returns {SerializedWateringPlan} custom JSON representation that can be used by fromJSON
   */
  static toJSON(wateringPlan: WateringPlan): SerializedWateringPlan {
    /* eslint no-underscore-dangle: ["error", { "allow": ["_jobs", "_name"] }] */
    const json : SerializedWateringPlan = {
      _name: wateringPlan._name,
      _jobs: wateringPlan._jobs.map((job) => WateringJob.toJSON(job)),
    };
    return json;
  }
}

export default WateringPlan;

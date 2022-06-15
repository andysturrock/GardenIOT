import fs from 'fs/promises';
import path from 'node:path';
import SerializedWateringPlan from './serialization/serialized-watering-plan';
import WateringJob from './watering-job';

class WateringPlan {
  private _jobs: WateringJob[] = [];

  private readonly _name;

  // TODO Make Windows compatible, but low priority given this
  // is intended to run on a Raspberry Pi.
  private static readonly fileStorePath = '/wateringplans';

  private readonly filename;

  constructor(name: string) {
    this._name = name;
    this.filename = path.resolve(WateringPlan.fileStorePath, `wateringplan-${name}.json`);
  }

  async load() {
    const json:string = await fs.readFile(this.filename, 'utf8');
    const serializedWateringPlan : SerializedWateringPlan = JSON.parse(json);
    const other : WateringPlan = WateringPlan.fromJSON(serializedWateringPlan);
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

  /**
  * Create a WateringPlan instance from the SerializedWateringPlan.
  * @param {SerializedWateringPlan} json SerializedWateringPlan to deserialize
  * @returns new WateringPlan instance
  */
  static fromJSON(json: SerializedWateringPlan) {
    const wateringPlan  = new WateringPlan(json._name);
    json._jobs.forEach(jobJson => {
      const wateringJob = WateringJob.fromJSON(jobJson);
      wateringPlan.add(wateringJob);
    })
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

import fs from 'fs/promises';
import path from 'node:path';
import WateringJob from './watering-job';

class WateringPlan {
  private jobs: WateringJob[] = [];

  private readonly _name;

  private static readonly fileStorePath = '/wateringplans'; // TODO Make Windows compatible

  private readonly filename;

  constructor(name: string) {
    this._name = name;
    this.filename = path.resolve(WateringPlan.fileStorePath, `wateringplan-${name}.json`);
  }

  async load() {
    const jsJobs:string = await fs.readFile(this.filename, 'utf8');
    this.jobs = JSON.parse(jsJobs);
  }

  async save() {
    const json = this.jobsToJSON();
    await fs.writeFile(this.filename, JSON.stringify(json), 'utf8');
  }

  add(wateringJob: WateringJob) {
    this.jobs.push(wateringJob);
  }

  private jobsToJSON() {
    const anyArray: any[] = [];
    const json = {
      jobs: anyArray,
    };
    this.jobs.forEach((job) => {
      const jobJSON = {
        rule: job.rule,
        duration: job.duration,
        relays: job.relays,
      };
      json.jobs.push(jobJSON);
    });
    return json;
  }
}

export default WateringPlan;

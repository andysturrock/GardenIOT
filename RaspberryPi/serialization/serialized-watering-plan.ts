import SerializedWateringJob from './serialized-watering-job';

interface SerializedWateringPlan {
  _name: string;
  _jobs: SerializedWateringJob[];
}

export default SerializedWateringPlan;

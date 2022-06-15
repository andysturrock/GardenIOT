import WateringPlan from '../watering-plan';
import schedule from 'node-schedule';
import Relay from '../relay';
import WateringJob from '../watering-job';

function createRule() {
  const rule = new schedule.RecurrenceRule();

  // Set all the fields
  rule.date = 14;
  rule.month = 6;
  rule.year = 2022;
  rule.dayOfWeek = 2; // Tuesday
  rule.hour = 2;
  rule.minute = 3;
  rule.second = 5;
  rule.tz = "Europe/London";

  return rule;
}

function createRelays() {
  return [new Relay(Relay.RELAY1), new Relay(Relay.RELAY2)];
}

function createWateringPlan() {
  const rule = createRule();
  const relays = createRelays();
  const wateringJob = new WateringJob(rule, 10, relays);
  const wateringPlan = new WateringPlan("Test WateringPlan");
  wateringPlan.add(wateringJob);
  return wateringPlan;
}

test('Serialises and deserialises correctly', () => {
  const expected = createWateringPlan();

  const json = WateringPlan.toJSON(expected);
  const actual = WateringPlan.fromJSON(json);

  expect(actual).toEqual(expected);

  const expectedJSON = JSON.stringify(expected);
  const actualJSON = JSON.stringify(actual);

  expect(actualJSON).toEqual(expectedJSON);
});

test('Saves and loads correctly', async () => {
  const expected = createWateringPlan();
  await expected.save();

  const actual = createWateringPlan();
  actual.clearJobs();
  await actual.load();

  expect(actual).toEqual(expected);

  const expectedJSON = JSON.stringify(expected);
  const actualJSON = JSON.stringify(actual);

  expect(actualJSON).toEqual(expectedJSON);
});

import WateringPlan from '../watering-plan';
import schedule from 'node-schedule';
import Relay from '../relay';
import WateringJob from '../watering-job';

test('Serialises and deserialises correctly', () => {
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
  
  const relays = [new Relay(Relay.RELAY1), new Relay(Relay.RELAY2)];
  const wateringJob = new WateringJob(rule, 10, relays);

  const expected = new WateringPlan("Test WateringPlan");
  expected.add(wateringJob);

  const json = WateringPlan.toJSON(expected);
  const actual = WateringPlan.fromJSON(json);

  expect(expected).toEqual(actual);

  const expectedJSON = JSON.stringify(expected);
  const actualJSON = JSON.stringify(actual);

  expect(expectedJSON).toEqual(actualJSON);
});
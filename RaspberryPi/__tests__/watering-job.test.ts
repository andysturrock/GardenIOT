import WateringJob from '../watering-job';
import schedule from 'node-schedule';
import Relay from '../relay';

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
  const expected = new WateringJob(rule, 10, relays);

  const json = WateringJob.toJSON(expected);
  const actual = WateringJob.fromJSON(json);

  expect(actual).toEqual(expected);

  const expectedJSON = JSON.stringify(expected);
  const actualJSON = JSON.stringify(actual);

  expect(actualJSON).toEqual(expectedJSON);
});
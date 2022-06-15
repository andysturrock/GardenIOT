import Relay from '../relay';

test('Serialises and deserialises correctly', () => {
  const expected = new Relay(Relay.RELAY1);

  const json = Relay.toJSON(expected);

  const actual = Relay.fromJSON(json);

  expect(actual).toEqual(expected);

  const expectedJSON = JSON.stringify(expected);
  const actualJSON = JSON.stringify(actual);

  expect(actualJSON).toEqual(expectedJSON);
});

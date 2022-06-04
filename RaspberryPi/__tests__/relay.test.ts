import Relay from '../relay';

test('Serialises and deserialises correctly', () => {
  const expected = new Relay(Relay.RELAY1);

  const json = Relay.toJSON(expected);

  const actual = Relay.fromJSON(json);

  expect(expected).toEqual(actual);

  const expectedJSON = JSON.stringify(expected);
  const actualJSON = JSON.stringify(actual);

  expect(expectedJSON).toEqual(actualJSON);
});

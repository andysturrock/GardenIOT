import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { lambdaHandler } from '../src/temperature_get';

const TABLE = process.env.TEMPERATURE_HISTORY_TABLE!;
const ddbMock = mockClient(DynamoDBClient);

interface ApiGatewayEvent {
  queryStringParameters?: Record<string, string | null> | null;
  requestContext?: { requestId?: string };
  body?: string | null;
  isBase64Encoded?: boolean;
}

function getEvent(ids: number[]): ApiGatewayEvent {
  return {
    queryStringParameters: Object.fromEntries(
      ids.map((id) => [`sensor_id${id}`, '']),
    ),
    requestContext: { requestId: 'req-test-1' },
  };
}

beforeEach(() => {
  ddbMock.reset();
});

describe('temperature_get', () => {
  describe('success cases', () => {
    test('returns the latest reading for each sensor id from the query string', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [{
            sensor_id: { N: '1' },
            timestamp: { N: '1700000000000' },
            temperature: { N: '18.5' },
          }],
        })
        .resolvesOnce({
          Items: [{
            sensor_id: { N: '2' },
            timestamp: { N: '1700000000500' },
            temperature: { N: '12.3' },
          }],
        });

      const res = await lambdaHandler(getEvent([1, 2]));

      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(res.body)).toEqual([
        { sensor_id: 1, temperature: 18.5, timestamp: 1700000000000 },
        { sensor_id: 2, temperature: 12.3, timestamp: 1700000000500 },
      ]);
    });

    test('issues one Query per requested sensor against the configured table', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(getEvent([5, 9, 11]));

      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(3);
      for (const call of calls) {
        const input = call.args[0].input as QueryCommandInput;
        expect(input.TableName).toBe(TABLE);
        expect(input.KeyConditionExpression).toContain('sensor_id');
        expect(input.ScanIndexForward).toBe(false);
        expect(input.Limit).toBe(1);
      }
    });

    test('omits sensors with no rows from the response (rather than null entries)', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [{
            sensor_id: { N: '1' },
            timestamp: { N: '1000' },
            temperature: { N: '15' },
          }],
        })
        .resolvesOnce({ Items: [] });

      const res = await lambdaHandler(getEvent([1, 2]));
      const body = JSON.parse(res.body);

      expect(body).toHaveLength(1);
      expect(body[0].sensor_id).toBe(1);
    });

    test('omits sensors whose latest row is missing temperature or timestamp fields', async () => {
      ddbMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [{ sensor_id: { N: '1' } /* no temp/timestamp */ }],
        });

      const res = await lambdaHandler(getEvent([1]));
      expect(JSON.parse(res.body)).toEqual([]);
    });

    test('returns an empty array when no sensors are requested', async () => {
      const res = await lambdaHandler({
        queryStringParameters: null,
        requestContext: { requestId: 'req-empty' },
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual([]);
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
    });
  });

  describe('input parsing', () => {
    test('ignores query string keys that do not start with sensor_id', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler({
        queryStringParameters: {
          sensor_id1: '',
          totally_unrelated: 'foo',
          'fake-sensor_id_X': '',
        },
        requestContext: { requestId: 'req-skip' },
      });
      const calls = ddbMock.commandCalls(QueryCommand);
      // sensor_id1 → 1 (valid), totally_unrelated → NaN (skipped),
      // fake-sensor_id_X → doesn't start with sensor_id → skipped.
      expect(calls).toHaveLength(1);
    });

    test('parses bare "sensor_id" (no number) as NaN and skips it', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler({
        queryStringParameters: { sensor_id: '', sensor_id3: '' },
        requestContext: { requestId: 'req-bare' },
      });
      // sensor_id → "" parsed as NaN → skipped
      // sensor_id3 → 3 → kept
      const calls = ddbMock.commandCalls(QueryCommand);
      expect(calls).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    test('returns 500 with requestId when DynamoDB throws', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB unavailable'));

      const res = await lambdaHandler(getEvent([1]));

      expect(res.statusCode).toBe(500);
      expect(res.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Internal error');
      expect(body.requestId).toBe('req-test-1');
    });

    test('500 body still parses as JSON when requestContext is missing', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('boom'));

      const res = await lambdaHandler({
        queryStringParameters: { sensor_id1: '' },
      });

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.requestId).toBeUndefined();
    });
  });
});

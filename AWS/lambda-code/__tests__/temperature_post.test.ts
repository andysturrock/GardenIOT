import { describe, test, expect, beforeEach } from 'vitest';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { lambdaHandler } from '../src/temperature_post';

const TABLE = process.env.TEMPERATURE_HISTORY_TABLE!;
const ddbMock = mockClient(DynamoDBClient);

interface ApiGatewayPostEvent {
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { requestId?: string };
}

function postEvent(body: unknown, requestId = 'req-test'): ApiGatewayPostEvent {
  return {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    requestContext: { requestId },
  };
}

beforeEach(() => {
  ddbMock.reset();
});

describe('temperature_post', () => {
  describe('success cases', () => {
    test('writes one PutItem per reading', async () => {
      ddbMock.on(PutItemCommand).resolves({});
      const res = await lambdaHandler(postEvent([
        { sensor_id: 1, temperature: 18.5 },
        { sensor_id: 2, temperature: 12.3 },
        { sensor_id: 3, temperature: 22.1 },
      ]));

      expect(res.statusCode).toBe(200);
      expect(res.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(res.body)).toEqual({ insertCount: 3 });
      expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(3);
    });

    test('writes against the configured TEMPERATURE_HISTORY_TABLE', async () => {
      ddbMock.on(PutItemCommand).resolves({});
      await lambdaHandler(postEvent([{ sensor_id: 1, temperature: 10 }]));

      const call = ddbMock.commandCalls(PutItemCommand)[0];
      expect(call.args[0].input.TableName).toBe(TABLE);
    });

    test('uses caller-supplied timestamp when present', async () => {
      ddbMock.on(PutItemCommand).resolves({});
      await lambdaHandler(postEvent([
        { sensor_id: 1, temperature: 20, timestamp: 1700000000000 },
      ]));

      const item = ddbMock.commandCalls(PutItemCommand)[0].args[0].input.Item!;
      expect(item.timestamp).toEqual({ N: '1700000000000' });
      expect(item.sensor_id).toEqual({ N: '1' });
      expect(item.temperature).toEqual({ N: '20' });
    });

    test('falls back to Date.now() when caller omits the timestamp', async () => {
      ddbMock.on(PutItemCommand).resolves({});
      const before = Date.now();
      await lambdaHandler(postEvent([{ sensor_id: 1, temperature: 20 }]));
      const after = Date.now();

      const ts = Number(ddbMock.commandCalls(PutItemCommand)[0].args[0].input.Item!.timestamp.N);
      expect(ts).toBeGreaterThanOrEqual(before);
      expect(ts).toBeLessThanOrEqual(after);
    });

    test('decodes base64-encoded body before parsing', async () => {
      ddbMock.on(PutItemCommand).resolves({});
      const body = Buffer.from(JSON.stringify([
        { sensor_id: 1, temperature: 9 },
      ])).toString('base64');

      const res = await lambdaHandler({
        body,
        isBase64Encoded: true,
        requestContext: { requestId: 'req-b64' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ insertCount: 1 });
    });

    test('empty array succeeds with insertCount: 0 (no DynamoDB calls)', async () => {
      const res = await lambdaHandler(postEvent([]));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ insertCount: 0 });
      expect(ddbMock.commandCalls(PutItemCommand)).toHaveLength(0);
    });
  });

  describe('400 validation errors', () => {
    test('missing body returns 400', async () => {
      const res = await lambdaHandler({ requestContext: { requestId: 'r' } });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/Empty body/);
    });

    test('null body returns 400', async () => {
      const res = await lambdaHandler({ body: null, requestContext: { requestId: 'r' } });
      expect(res.statusCode).toBe(400);
    });

    test('non-JSON body returns 400', async () => {
      const res = await lambdaHandler({ body: '{not json', requestContext: { requestId: 'r' } });
      expect(res.statusCode).toBe(400);
    });

    test('body that is not an array returns 400', async () => {
      const res = await lambdaHandler(postEvent({ sensor_id: 1, temperature: 10 }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/array/);
    });

    test('item missing sensor_id returns 400', async () => {
      const res = await lambdaHandler(postEvent([{ temperature: 10 }]));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/sensor_id/);
    });

    test('item with non-number sensor_id returns 400', async () => {
      const res = await lambdaHandler(postEvent([{ sensor_id: '1', temperature: 10 }]));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/sensor_id/);
    });

    test('item with NaN sensor_id returns 400', async () => {
      const res = await lambdaHandler(postEvent([{ sensor_id: NaN, temperature: 10 }]));
      expect(res.statusCode).toBe(400);
    });

    test('item missing temperature returns 400', async () => {
      const res = await lambdaHandler(postEvent([{ sensor_id: 1 }]));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/temperature/);
    });

    test('item with non-number temperature returns 400', async () => {
      const res = await lambdaHandler(postEvent([{ sensor_id: 1, temperature: 'cold' }]));
      expect(res.statusCode).toBe(400);
    });

    test('item with non-number timestamp returns 400', async () => {
      const res = await lambdaHandler(postEvent([
        { sensor_id: 1, temperature: 10, timestamp: 'now' },
      ]));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/timestamp/);
    });
  });

  describe('500 error handling', () => {
    test('returns 500 with requestId when DynamoDB throws', async () => {
      ddbMock.on(PutItemCommand).rejects(new Error('throttled'));

      const res = await lambdaHandler(postEvent(
        [{ sensor_id: 1, temperature: 10 }],
        'req-fail',
      ));

      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Internal error');
      expect(body.requestId).toBe('req-fail');
    });
  });
});

import { describe, test, expect, beforeEach, vi } from 'vitest';
import {
  DynamoDBClient,
  QueryCommand,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

import { lambdaHandler } from '../src/logs_get';

const TABLE = process.env.GARDEN_LOG_TABLE!;
const DEVICE = process.env.GARDEN_DEVICE_ID!;
const ddbMock = mockClient(DynamoDBClient);

interface ApiGatewayEvent {
  queryStringParameters?: Record<string, string | null> | null;
  requestContext?: { requestId?: string };
}

function event(qs: Record<string, string> = {}): ApiGatewayEvent {
  return {
    queryStringParameters: qs,
    requestContext: { requestId: 'req-logs-test' },
  };
}

function ddbItem(opts: {
  ts: number;
  level?: string;
  category?: string;
  message?: string;
  meta?: Record<string, { S?: string; N?: string; M?: unknown; L?: unknown[] }>;
}) {
  const out: Record<string, { S?: string; N?: string; M?: unknown }> = {
    timestamp: { N: `${opts.ts}` },
    level: { S: opts.level ?? 'info' },
    category: { S: opts.category ?? 'user' },
    message: { S: opts.message ?? 'hello' },
  };
  if (opts.meta) out.meta = { M: opts.meta };
  return out;
}

beforeEach(() => {
  ddbMock.reset();
});

describe('logs_get', () => {
  describe('happy path', () => {
    test('queries the right partition and returns parsed records most-recent-first', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          ddbItem({ ts: 3000, message: 'newest' }),
          ddbItem({ ts: 2000, message: 'middle' }),
          ddbItem({ ts: 1000, message: 'oldest' }),
        ],
      });

      const res = await lambdaHandler(event({ category: 'user', limit: '10' }));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.logs.map((l: { message: string }) => l.message)).toEqual([
        'newest', 'middle', 'oldest',
      ]);
      expect(body.nextBefore).toBeNull();

      const call = ddbMock.commandCalls(QueryCommand)[0];
      const input = call.args[0].input as QueryCommandInput;
      expect(input.TableName).toBe(TABLE);
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(10);
      expect(input.ExpressionAttributeValues![':pk']).toEqual({ S: `${DEVICE}#user` });
    });

    test('defaults category=user and limit=50 when not provided', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event());
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.ExpressionAttributeValues![':pk']).toEqual({ S: `${DEVICE}#user` });
      expect(input.Limit).toBe(50);
    });

    test('reads category=technical when requested', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event({ category: 'technical' }));
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.ExpressionAttributeValues![':pk']).toEqual({ S: `${DEVICE}#technical` });
    });

    test('uses Date.now() when before is missing', async () => {
      const now = Date.now();
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event());
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      const before = Number(input.ExpressionAttributeValues![':before'].N);
      expect(before).toBeGreaterThanOrEqual(now);
    });

    test('uses the supplied before cursor', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event({ before: '1700000000000' }));
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.ExpressionAttributeValues![':before']).toEqual({ N: '1700000000000' });
    });

    test('uses #ts alias so DynamoDB doesn\'t reject the reserved word', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event());
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.KeyConditionExpression).toContain('#ts');
      expect(input.ExpressionAttributeNames).toEqual({ '#ts': 'timestamp' });
    });
  });

  describe('pagination', () => {
    test('returns nextBefore = last item timestamp when LastEvaluatedKey is set', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          ddbItem({ ts: 3000 }),
          ddbItem({ ts: 2000 }),
        ],
        LastEvaluatedKey: {
          pk: { S: `${DEVICE}#user` },
          timestamp: { N: '2000' },
        },
      });
      const res = await lambdaHandler(event({ limit: '2' }));
      const body = JSON.parse(res.body);
      expect(body.nextBefore).toBe(2000);
    });

    test('returns nextBefore=null when LastEvaluatedKey is absent', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [ddbItem({ ts: 3000 })],
      });
      const body = JSON.parse((await lambdaHandler(event())).body);
      expect(body.nextBefore).toBeNull();
    });

    test('returns nextBefore=null on an empty page', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const body = JSON.parse((await lambdaHandler(event())).body);
      expect(body.logs).toEqual([]);
      expect(body.nextBefore).toBeNull();
    });
  });

  describe('input validation', () => {
    test('returns 400 on bad category', async () => {
      const res = await lambdaHandler(event({ category: 'nope' }));
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toMatch(/category/);
      expect(ddbMock.commandCalls(QueryCommand)).toHaveLength(0);
    });

    test('clamps limit > 200 down to 200', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event({ limit: '9999' }));
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.Limit).toBe(200);
    });

    test('clamps limit < 1 up to 1', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event({ limit: '0' }));
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.Limit).toBe(1);
    });

    test('falls back to default limit on non-numeric input', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event({ limit: 'abc' }));
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      expect(input.Limit).toBe(50);
    });

    test('falls back to Date.now() on non-numeric before', async () => {
      const now = Date.now();
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      await lambdaHandler(event({ before: 'tomorrow' }));
      const input = ddbMock.commandCalls(QueryCommand)[0].args[0].input as QueryCommandInput;
      const before = Number(input.ExpressionAttributeValues![':before'].N);
      expect(before).toBeGreaterThanOrEqual(now);
    });

    test('tolerates missing queryStringParameters (null)', async () => {
      ddbMock.on(QueryCommand).resolves({ Items: [] });
      const res = await lambdaHandler({
        queryStringParameters: null,
        requestContext: { requestId: 'req-x' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('item parsing', () => {
    test('drops rows missing required fields', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          { timestamp: { N: '1' }, level: { S: 'info' }, category: { S: 'user' } /* no message */ },
          ddbItem({ ts: 2, message: 'good' }),
        ],
      });
      const body = JSON.parse((await lambdaHandler(event())).body);
      expect(body.logs).toHaveLength(1);
      expect(body.logs[0].message).toBe('good');
    });

    test('passes through meta as a plain JS object (decoded from DynamoDB AttributeValue)', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [
          ddbItem({
            ts: 1,
            message: 'with meta',
            meta: {
              job_id: { S: 'morning-veg' },
              duration_s: { N: '300' },
              relays: { L: [{ N: '1' }, { N: '2' }] },
              dry_run: { BOOL: false },
              note: { NULL: true },
              nested: { M: { k: { S: 'v' } } },
            },
          }),
        ],
      });
      const body = JSON.parse((await lambdaHandler(event())).body);
      expect(body.logs[0].meta).toEqual({
        job_id: 'morning-veg',
        duration_s: 300,
        relays: [1, 2],
        dry_run: false,
        note: null,
        nested: { k: 'v' },
      });
    });

    test('passes through meta with empty {} payload', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [ddbItem({ ts: 1, meta: {} })],
      });
      const body = JSON.parse((await lambdaHandler(event())).body);
      expect(body.logs[0].meta).toEqual({});
    });

    test('omits meta when absent on the row', async () => {
      ddbMock.on(QueryCommand).resolves({
        Items: [ddbItem({ ts: 1 })],
      });
      const body = JSON.parse((await lambdaHandler(event())).body);
      expect('meta' in body.logs[0]).toBe(false);
    });
  });

  describe('error handling', () => {
    test('returns 500 with requestId when DynamoDB throws', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('DynamoDB on fire'));
      const res = await lambdaHandler(event());
      expect(res.statusCode).toBe(500);
      const body = JSON.parse(res.body);
      expect(body.error).toBe('Internal error');
      expect(body.requestId).toBe('req-logs-test');
    });

    test('500 body still parses as JSON when requestContext is missing', async () => {
      ddbMock.on(QueryCommand).rejects(new Error('boom'));
      const res = await lambdaHandler({ queryStringParameters: {} });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).requestId).toBeUndefined();
    });

    test('logs the error to console.error', async () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      ddbMock.on(QueryCommand).rejects(new Error('boom'));
      await lambdaHandler(event());
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });
});

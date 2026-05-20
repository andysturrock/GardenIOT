import { DynamoDBClient, QueryCommand, QueryCommandInput } from '@aws-sdk/client-dynamodb';

const TABLE = process.env.TEMPERATURE_HISTORY_TABLE!;
const ddb = new DynamoDBClient({});

interface Reading {
  sensor_id: number;
  temperature: number;
  timestamp: number;
}

async function latestReading(sensorId: number): Promise<Reading | undefined> {
  const params: QueryCommandInput = {
    TableName: TABLE,
    KeyConditionExpression: 'sensor_id = :sid',
    ExpressionAttributeValues: { ':sid': { N: `${sensorId}` } },
    ScanIndexForward: false,
    Limit: 1,
  };
  const out = await ddb.send(new QueryCommand(params));
  const item = out.Items?.[0];
  if (!item || !item.temperature?.N || !item.timestamp?.N) return undefined;
  return {
    sensor_id: sensorId,
    temperature: Number(item.temperature.N),
    timestamp: Number(item.timestamp.N),
  };
}

async function lambdaHandler(event: any): Promise<any> {
  try {
    // API contract: sensor IDs are encoded in the *keys* of the query
    // string (e.g. ?sensor_id1=&sensor_id2=). Values are ignored. Weird
    // but kept for compatibility with the existing mobile app.
    const sensorIds: number[] = [];
    for (const key in event.queryStringParameters ?? {}) {
      const idStr = key.replace(/^sensor_id/, '');
      const id = Number.parseInt(idStr, 10);
      if (Number.isFinite(id)) sensorIds.push(id);
    }

    const results: Reading[] = [];
    for (const id of sensorIds) {
      const reading = await latestReading(id);
      if (reading) results.push(reading);
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(results),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.stack : JSON.stringify(err);
    console.error(`temperature_get error: ${detail}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal error',
        requestId: event?.requestContext?.requestId,
      }),
    };
  }
}

export { lambdaHandler };

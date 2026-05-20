import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const TABLE = process.env.TEMPERATURE_HISTORY_TABLE!;
const ddb = new DynamoDBClient({});

interface Reading {
  sensor_id: number;
  temperature: number;
  timestamp?: number;
}

function parseBody(event: any): Reading[] {
  if (!event?.body) throw new Error('Empty body');
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, 'base64').toString('utf8')
    : event.body;
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('Body must be a JSON array');
  return parsed.map((item, i) => {
    if (typeof item?.sensor_id !== 'number' || !Number.isFinite(item.sensor_id)) {
      throw new Error(`Item ${i}: sensor_id must be a number`);
    }
    if (typeof item?.temperature !== 'number' || !Number.isFinite(item.temperature)) {
      throw new Error(`Item ${i}: temperature must be a number`);
    }
    if (item.timestamp !== undefined &&
        (typeof item.timestamp !== 'number' || !Number.isFinite(item.timestamp))) {
      throw new Error(`Item ${i}: timestamp must be a number if present`);
    }
    return item as Reading;
  });
}

async function lambdaHandler(event: any): Promise<any> {
  const requestId = event?.requestContext?.requestId;
  let readings: Reading[];
  try {
    readings = parseBody(event);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bad request';
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: message }),
    };
  }

  try {
    const now = Date.now();
    let count = 0;
    for (const reading of readings) {
      const timestamp = reading.timestamp ?? now;
      await ddb.send(new PutItemCommand({
        TableName: TABLE,
        Item: {
          sensor_id: { N: `${reading.sensor_id}` },
          timestamp: { N: `${timestamp}` },
          temperature: { N: `${reading.temperature}` },
        },
      }));
      ++count;
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ insertCount: count }),
    };
  } catch (err) {
    const detail = err instanceof Error ? err.stack : JSON.stringify(err);
    console.error(`temperature_post error (requestId=${requestId}): ${detail}`);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal error', requestId }),
    };
  }
}

export { lambdaHandler };

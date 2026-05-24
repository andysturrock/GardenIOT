import { DynamoDBClient, QueryCommand, QueryCommandInput } from '@aws-sdk/client-dynamodb';

const TABLE = process.env.GARDEN_LOG_TABLE!;
const DEVICE_ID = process.env.GARDEN_DEVICE_ID!;
const ddb = new DynamoDBClient({});

type LogCategory = 'user' | 'technical';

interface LogRecord {
  timestamp: number;
  level: string;
  category: LogCategory;
  message: string;
  meta?: unknown;
}

interface LogsPage {
  logs: LogRecord[];
  nextBefore: number | null;
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseCategory(raw: unknown): LogCategory {
  if (raw === undefined || raw === null || raw === '') return 'user';
  if (raw === 'user' || raw === 'technical') return raw;
  throw new Error(`category must be "user" or "technical"`);
}

function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return DEFAULT_LIMIT;
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  if (n < 1) return 1;
  if (n > MAX_LIMIT) return MAX_LIMIT;
  return n;
}

function parseBefore(raw: unknown): number {
  if (raw === undefined || raw === null || raw === '') return Date.now();
  const n = Number.parseInt(String(raw), 10);
  if (!Number.isFinite(n)) return Date.now();
  return n;
}

function itemToRecord(item: Record<string, { S?: string; N?: string; M?: unknown }>): LogRecord | null {
  const ts = item.timestamp?.N;
  const lvl = item.level?.S;
  const cat = item.category?.S;
  const msg = item.message?.S;
  if (!ts || !lvl || !cat || msg === undefined) return null;
  const record: LogRecord = {
    timestamp: Number(ts),
    level: lvl,
    category: cat as LogCategory,
    message: msg,
  };
  if (item.meta !== undefined) {
    // The IoT rule writes nested JSON via DynamoDBv2PutItemAction, which
    // produces DynamoDB AttributeValue maps. Pass it through opaquely so
    // the client gets the original shape rendered as JSON.
    record.meta = dynamoToJs(item.meta);
  }
  return record;
}

function dynamoToJs(av: unknown): unknown {
  if (av === null || av === undefined) return av;
  if (typeof av !== 'object') return av;
  const a = av as Record<string, unknown>;
  if ('S' in a) return a.S;
  if ('N' in a) return Number(a.N);
  if ('BOOL' in a) return a.BOOL;
  if ('NULL' in a) return null;
  if ('L' in a) return (a.L as unknown[]).map(dynamoToJs);
  if ('M' in a) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(a.M as Record<string, unknown>)) {
      out[k] = dynamoToJs(v);
    }
    return out;
  }
  return av;
}

async function lambdaHandler(event: any): Promise<any> {
  try {
    const qs = event.queryStringParameters ?? {};
    const category = parseCategory(qs.category);
    const limit = parseLimit(qs.limit);
    const before = parseBefore(qs.before);

    const params: QueryCommandInput = {
      TableName: TABLE,
      KeyConditionExpression: 'pk = :pk AND #ts < :before',
      ExpressionAttributeNames: { '#ts': 'timestamp' },
      ExpressionAttributeValues: {
        ':pk': { S: `${DEVICE_ID}#${category}` },
        ':before': { N: `${before}` },
      },
      ScanIndexForward: false,
      Limit: limit,
    };

    const out = await ddb.send(new QueryCommand(params));
    const logs: LogRecord[] = [];
    for (const item of out.Items ?? []) {
      const rec = itemToRecord(item as Record<string, { S?: string; N?: string; M?: unknown }>);
      if (rec) logs.push(rec);
    }

    // DynamoDB Query sets LastEvaluatedKey iff more pages exist. Use the
    // timestamp of the last returned item as the next page's `before` cursor.
    const nextBefore = out.LastEvaluatedKey && logs.length > 0
      ? logs[logs.length - 1].timestamp
      : null;
    const body: LogsPage = { logs, nextBefore };

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    };
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('category must be')) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message }),
      };
    }
    const detail = err instanceof Error ? err.stack : JSON.stringify(err);
    console.error(`logs_get error: ${detail}`);
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

import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DynamoDBStack extends Stack {
  public readonly temperatureHistoryTable: dynamodb.Table;
  public readonly logTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Partition by sensor_id so all readings for one sensor live in the
    // same partition; sort by timestamp so we can `Query` with
    // ScanIndexForward=false Limit=1 for the latest reading, or range
    // over a time window without a Scan. Logical ID is intentionally
    // TableV2 — the original TableV1 had the keys backwards and was
    // removed in a separate cleanup deploy.
    this.temperatureHistoryTable = new dynamodb.Table(this, 'TemperatureHistoryTableV2', {
      partitionKey: { name: 'sensor_id', type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Per-device, per-category log archive. Partition key is the composite
    // `${device_id}#${category}` so a single Query against one partition
    // (with ScanIndexForward=false, Limit=N) is enough for the most-recent-
    // first paginated view the app needs. 90-day TTL keeps the table bounded.
    this.logTable = new dynamodb.Table(this, 'GardenLogTable', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      timeToLiveAttribute: 'ttl',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY,
    });
  }
}

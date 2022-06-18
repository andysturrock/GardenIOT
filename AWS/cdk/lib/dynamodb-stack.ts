import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

export class DynamoDBStack extends Stack {
  public readonly temperatureHistoryTable: dynamodb.Table;
  public readonly lastSensorReadingTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.temperatureHistoryTable = new dynamodb.Table(this, 'TemperatureHistoryTable', {
      tableName: "TemperatureHistory",
      partitionKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      sortKey: { name: "sensor_id", type: dynamodb.AttributeType.NUMBER },
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: RemovalPolicy.DESTROY
    });
    let readScaling = this.temperatureHistoryTable.autoScaleReadCapacity({ minCapacity: 1, maxCapacity: 10 });
    readScaling.scaleOnUtilization({ targetUtilizationPercent: 70 });
    let writeScaling = this.temperatureHistoryTable.autoScaleWriteCapacity({ minCapacity: 1, maxCapacity: 10 });
    writeScaling.scaleOnUtilization({ targetUtilizationPercent: 70 });

    this.lastSensorReadingTable = new dynamodb.Table(this, 'LastSensorReadingTable', {
      tableName: "LastSensorReading",
      partitionKey: { name: 'sensor_type', type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sensor_id", type: dynamodb.AttributeType.NUMBER },
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: RemovalPolicy.DESTROY
    });
    readScaling = this.lastSensorReadingTable.autoScaleReadCapacity({ minCapacity: 1, maxCapacity: 10 });
    readScaling.scaleOnUtilization({ targetUtilizationPercent: 70 });
    writeScaling = this.lastSensorReadingTable.autoScaleWriteCapacity({ minCapacity: 1, maxCapacity: 10 });
    writeScaling.scaleOnUtilization({ targetUtilizationPercent: 70 });

    // Create exports from the CF template so that CF knows that other stacks depend on this stack.
    this.exportValue(this.temperatureHistoryTable.tableArn);
    this.exportValue(this.lastSensorReadingTable.tableArn);
  }
}

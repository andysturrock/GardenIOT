import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';

export class DynamoDBStack extends cdk.Stack {
  public readonly temperatureTable: dynamodb.Table;

  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.temperatureTable = new dynamodb.Table(this, 'TemperatureTable', {
      tableName: "Temperature",
      partitionKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      sortKey: {name: "sensor_id", type: dynamodb.AttributeType.NUMBER},
      readCapacity: 1,
      writeCapacity: 1,
      removalPolicy: cdk.RemovalPolicy.DESTROY
    });
    const readScaling = this.temperatureTable.autoScaleReadCapacity({minCapacity: 1, maxCapacity: 10});
    readScaling.scaleOnUtilization({targetUtilizationPercent: 70});
    const writeScaling = this.temperatureTable.autoScaleWriteCapacity({minCapacity: 1, maxCapacity: 10});
    writeScaling.scaleOnUtilization({targetUtilizationPercent: 70});

    // Create an export from the CF template so that CF knows that other stacks depend on this stack.
    this.exportValue(this.temperatureTable.tableArn);
  }
}
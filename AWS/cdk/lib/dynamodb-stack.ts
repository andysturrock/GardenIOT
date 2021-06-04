import * as cdk from '@aws-cdk/core';
import * as dynamodb from '@aws-cdk/aws-dynamodb';
import getEnv from './common';

export class DynamoDBStack extends cdk.Stack {
  constructor(scope: cdk.Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const table = new dynamodb.Table(this, 'TemperatureTable', {
      tableName: "Temperature",
      partitionKey: { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
      sortKey: {name: "sensor_id", type: dynamodb.AttributeType.NUMBER},
      readCapacity: 1,
      writeCapacity: 1
    });
    const readScaling = table.autoScaleReadCapacity({minCapacity: 1, maxCapacity: 10});
    readScaling.scaleOnUtilization({targetUtilizationPercent: 70});
    const writeScaling = table.autoScaleWriteCapacity({minCapacity: 1, maxCapacity: 10});
    writeScaling.scaleOnUtilization({targetUtilizationPercent: 70});
  }
}

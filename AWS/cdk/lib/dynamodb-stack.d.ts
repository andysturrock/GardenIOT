import { Stack, StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export declare class DynamoDBStack extends Stack {
    readonly temperatureHistoryTable: dynamodb.Table;
    readonly lastSensorReadingTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: StackProps);
}

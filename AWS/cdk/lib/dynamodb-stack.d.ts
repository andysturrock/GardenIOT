import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
export declare class DynamoDBStack extends cdk.Stack {
    readonly temperatureHistoryTable: dynamodb.Table;
    readonly lastSensorReadingTable: dynamodb.Table;
    constructor(scope: Construct, id: string, props?: cdk.StackProps);
}

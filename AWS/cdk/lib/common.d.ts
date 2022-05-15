import * as cdk from 'aws-cdk-lib';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';
export interface LambdaStackProps extends cdk.StackProps {
    readonly temperatureHistoryTable: dynamodb.Table;
    readonly lastSensorReadingTable: dynamodb.Table;
}
export declare function getEnv(name: string, optional?: boolean): string | undefined;

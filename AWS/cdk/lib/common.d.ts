import { StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
export interface LambdaStackProps extends StackProps {
    readonly temperatureHistoryTable: dynamodb.Table;
    readonly lastSensorReadingTable: dynamodb.Table;
}
export declare function getEnv(name: string, optional?: boolean): string | undefined;

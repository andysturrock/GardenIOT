#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { IAMStack } from '../lib/iam-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { IOTStack } from '../lib/iot-stack';

const app = new cdk.App();
new IAMStack(app, 'IAMStack');
const dynamoDBStack = new DynamoDBStack(app, 'DynamoDBStack');
new LambdaStack(app, 'LambdaStack', {
  temperatureHistoryTable: dynamoDBStack.temperatureHistoryTable,
  lastSensorReadingTable: dynamoDBStack.lastSensorReadingTable
});
new IOTStack(app, 'IOTStack');
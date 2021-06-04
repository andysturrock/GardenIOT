#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { IAMStack } from '../lib/iam-stack';
import { LambdaStack } from '../lib/lambda-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';

const app = new cdk.App();
new IAMStack(app, 'IAMStack');
const dynamoDBStack = new DynamoDBStack(app, 'DynamoDBStack');
new LambdaStack(app, 'LambdaStack', { temperatureTable: dynamoDBStack.temperatureTable } );
  


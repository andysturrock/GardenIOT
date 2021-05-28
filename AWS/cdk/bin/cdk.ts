#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { IAMStack } from '../lib/iam-stack';
import { LambdaStack } from '../lib/lambda-stack';

const app = new cdk.App();
new IAMStack(app, 'IAMStack', {} );
new LambdaStack(app, 'LambdaStack', {} );
  


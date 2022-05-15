import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import { LambdaStackProps } from './common';
export declare class LambdaStack extends cdk.Stack {
    constructor(scope: Construct, id: string, props: LambdaStackProps);
}

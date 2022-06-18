import { Construct } from 'constructs';
import { Stack } from 'aws-cdk-lib';
import { LambdaStackProps } from './common';
export declare class LambdaStack extends Stack {
    constructor(scope: Construct, id: string, props: LambdaStackProps);
}

import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iot from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import { getEnv } from './common';

export class IOTStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const loggingTopic = getEnv('LOGGING_TOPIC', false)!;

    const bucketProps : s3.BucketProps = {
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    }
    const loggingBucket = new s3.Bucket(this, 'LoggingBucket', bucketProps);

    new iot.TopicRule(this, 'LoggingTopicRule', {
      topicRuleName: 'LoggingTopicRule', // optional
      description: 'Saves messages from the logging topic to S3', // optional
      sql: iot.IotSql.fromStringAsVer20160323(`SELECT * FROM '${loggingTopic}'`),
      actions: [new actions.S3PutObjectAction(loggingBucket)],
    });
  }
}

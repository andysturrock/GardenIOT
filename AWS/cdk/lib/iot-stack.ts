import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iot_alpha from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import { getEnv } from './common';

export class IOTStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const loggingTopic = getEnv('LOGGING_TOPIC', false)!;
    const clientId = getEnv('CLIENTID', false)!;

    const logGroup = new logs.LogGroup(this, 'StatusGroup');

    new iot_alpha.TopicRule(this, 'LoggingTopicRule', {
      topicRuleName: 'LoggingTopicRule', // optional
      description: 'Saves messages from the logging topic to S3', // optional
      sql: iot_alpha.IotSql.fromStringAsVer20160323(`SELECT * FROM '${loggingTopic}'`),
      actions: [new actions.CloudWatchLogsAction(logGroup)],
    });

    const cfnThing = new iot.CfnThing(this, 'CfnThing', {
      thingName: `${clientId}`,
    });

    const policyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Publish",
            "iot:Receive",
            "iot:RetainPublish"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topic/${loggingTopic}`
          ]
        },
        {
          "Effect": "Allow",
          "Action": "iot:Subscribe",
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${loggingTopic}`
          ]
        },
        {
          "Effect": "Allow",
          "Action": "iot:Connect",
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:client/${clientId}`
          ]
        }
      ]
    }
    const cfnPolicy = new iot.CfnPolicy(this, 'MyCfnPolicy', {
      policyDocument: policyDocument,
      policyName: 'GardenIOTPolicy',
    });
  }
}

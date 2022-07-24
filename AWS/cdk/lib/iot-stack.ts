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
    const clientId = getEnv('CLIENT_ID', false)!;
    const certificateArn = getEnv('CERT_ARN', false)!;
    const thingShadowUpdateTopic = `$aws/things/${clientId}/shadow/name/*/update`;
    const thingShadowUpdateAcceptedTopic = `${thingShadowUpdateTopic}/accepted`;
    const thingShadowUpdateRejectedTopic = `${thingShadowUpdateTopic}/rejected`;
    const thingShadowUpdateDeltaTopic = `${thingShadowUpdateTopic}/delta`;
    const thingShadowUpdateDocumentsTopic = `${thingShadowUpdateTopic}/documents`;

    const logGroup = new logs.LogGroup(this, 'StatusGroup', {
      logGroupName: 'Status'
    });

    new iot_alpha.TopicRule(this, 'LoggingTopicRule', {
      topicRuleName: 'LoggingTopicRule', // optional
      description: 'Saves messages from the logging topic to CloudWatch', // optional
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
            `arn:aws:iot:${this.region}:${this.account}:topic/${loggingTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDocumentsTopic}`,
          ]
        },
        {
          "Effect": "Allow",
          "Action": "iot:Subscribe",
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${loggingTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDocumentsTopic}`,
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
    const cfnPolicy = new iot.CfnPolicy(this, 'CfnPolicy', {
      policyDocument: policyDocument,
      policyName: 'GardenIOTPolicy',
    });

    const cfnPolicyPrincipalAttachment = new iot.CfnPolicyPrincipalAttachment(this,
      'CfnPolicyPrincipalAttachment', {
        policyName: cfnPolicy.policyName!.toString(),
        principal: certificateArn
      }
    );

    cfnPolicyPrincipalAttachment.addDependsOn(cfnPolicy);

    const cfnThingPrincipalAttachment = new iot.CfnThingPrincipalAttachment(this,
      'CfnThingPrincipalAttachment',
      {
        thingName: cfnThing.thingName!.toString(),
        principal: certificateArn
      }
    );

    cfnThingPrincipalAttachment.addDependsOn(cfnThing);
  }
}

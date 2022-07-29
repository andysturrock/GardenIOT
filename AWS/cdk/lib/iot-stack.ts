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

    const clientId = getEnv('CLIENT_ID', false)!;
    const loggingTopic = `${clientId}/logging`;
    const certificateArn = getEnv('CERT_ARN', false)!;
    // Note we are not using an interpolated string in this next statement.
    // The string "${iot:Connection.Thing.ThingName}" (ie with the $ sign and {}) is what we actually
    // want to set in the policy.  That means "anything registered as a thing in IOT core".
    const thingShadowUpdateTopic = '$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*/update';
    const thingShadowUpdateAcceptedTopic = `${thingShadowUpdateTopic}/accepted`;
    const thingShadowUpdateRejectedTopic = `${thingShadowUpdateTopic}/rejected`;
    const thingShadowUpdateDeltaTopic = `${thingShadowUpdateTopic}/delta`;
    const thingShadowUpdateDocumentsTopic = `${thingShadowUpdateTopic}/documents`;
    const thingShadowGetTopic = '$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*/get';
    const thingShadowGetAcceptedTopic = '$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*/get/accepted';
    const thingShadowGetRejectedTopic = '$aws/things/${iot:Connection.Thing.ThingName}/shadow/name/*/get/rejected';
    

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

    const policyDocument1 = {
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
            // As above, note quoted $ to use $ sign in the policy.
            `arn:aws:iot:${this.region}:${this.account}:topic/\${iot:Connection.Thing.ThingName}/logging`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDocumentsTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowGetTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowGetAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowGetRejectedTopic}`,
            
          ]
        }
      ]
    }
    const policyDocument2 = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": "iot:Subscribe",
          "Resource": [
            // As above note quoted $
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/\${iot:Connection.Thing.ThingName}/logging`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDocumentsTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowGetTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowGetAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowGetRejectedTopic}`,

          ]
        }
      ]
    }
    const policyDocument3 = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": "iot:Connect",
          "Resource": [
            // As above note quoted $
            `arn:aws:iot:${this.region}:${this.account}:client/\${iot:Connection.Thing.ThingName}`
          ]
        }
      ]
    }
    const policyDocuments = [policyDocument1, policyDocument2, policyDocument3];

    let index = 0;
    policyDocuments.forEach((policyDocument) => {
      ++index;
      const cfnPolicy = new iot.CfnPolicy(this, `CfnPolicy_${index}`, {
        policyDocument: policyDocument,
        policyName: `GardenIOTPolicy_${index}`,
      });

      const cfnPolicyPrincipalAttachment = new iot.CfnPolicyPrincipalAttachment(this,
        `CfnPolicyPrincipalAttachment_${index}`, {
          policyName: cfnPolicy.policyName!.toString(),
          principal: certificateArn
        }
      );

      cfnPolicyPrincipalAttachment.addDependsOn(cfnPolicy);

      const cfnThingPrincipalAttachment = new iot.CfnThingPrincipalAttachment(this,
        `CfnThingPrincipalAttachment_${index}`,
        {
          thingName: cfnThing.thingName!.toString(),
          principal: certificateArn
        }
      );

      cfnThingPrincipalAttachment.addDependsOn(cfnThing);
    });
  }
}

import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iot from 'aws-cdk-lib/aws-iot';
import * as iot_alpha from '@aws-cdk/aws-iot-alpha';
import * as actions from '@aws-cdk/aws-iot-actions-alpha';
import { getEnv } from './common';
import { CfnPolicyProps } from 'aws-cdk-lib/aws-iot';

export class IOTStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const clientId = getEnv('CLIENT_ID', false)!;
    const loggingTopic = `${clientId}/logging`;
    const deviceCertificateArn = getEnv('DEVICE_CERT_ARN', false)!;
    const mobileAppName = getEnv('MOBILE_APP_NAME', false)!;
    const mobileAppCertificateArn = getEnv('MOBILE_APP_CERT_ARN', false)!;
    const thingShadowUpdateTopic = `$aws/things/${clientId}/shadow/name/*/update`;
    const thingShadowUpdateAcceptedTopic = `${thingShadowUpdateTopic}/accepted`;
    const thingShadowUpdateRejectedTopic = `${thingShadowUpdateTopic}/rejected`;
    const thingShadowUpdateDeltaTopic = `${thingShadowUpdateTopic}/delta`;
    const thingShadowUpdateDocumentsTopic = `${thingShadowUpdateTopic}/documents`;
    const thingShadowGetTopic = `$aws/things/${clientId}/shadow/name/*/get`;
    const thingShadowGetAcceptedTopic = `${thingShadowGetTopic}/accepted`;
    const thingShadowGetRejectedTopic = `${thingShadowGetTopic}/rejected`;
    

    const logGroup = new logs.LogGroup(this, 'StatusGroup', {
      logGroupName: 'Status',
    });

    new iot_alpha.TopicRule(this, 'LoggingTopicRule', {
      topicRuleName: 'LoggingTopicRule', // optional
      description: 'Saves messages from the logging topic to CloudWatch', // optional
      sql: iot_alpha.IotSql.fromStringAsVer20160323(`SELECT * FROM '${loggingTopic}'`),
      actions: [new actions.CloudWatchLogsAction(logGroup)],
    });

    const deviceThing = new iot.CfnThing(this, 'DeviceThing', {
      thingName: `${clientId}`,
    });

    // TODO - for now create a thing for the mobile app and use it for permissions etc.
    // Should replace with AWS Cognito identity for the user.
    const mobileAppThing = new iot.CfnThing(this, 'MobileAppThing', {
      thingName: mobileAppName,
    });

    const devicePolicyProps: Array<CfnPolicyProps> = [];
    const devicePublishPolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Publish",
            "iot:RetainPublish"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topic/${clientId}/logging`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateTopic}`,
          ]
        }
      ]
    };
    devicePolicyProps.push( {
      policyDocument: devicePublishPolicyDocument,
      policyName: "DevicePublishPolicy"
    });
    const deviceReceivePolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Receive"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDocumentsTopic}`,
          ]
        }
      ]
    };
    devicePolicyProps.push( {
      policyDocument: deviceReceivePolicyDocument,
      policyName: "DeviceReceivePolicy"
    });
    const deviceSubscribePolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Subscribe"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDocumentsTopic}`,
          ]
        }
      ]
    };
    devicePolicyProps.push( {
      policyDocument: deviceSubscribePolicyDocument,
      policyName: "DeviceSubscribePolicy"
    });
    const deviceConnectPolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": "iot:Connect",
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:client/${clientId}`
          ]
        }
      ]
    };
    devicePolicyProps.push( {
      policyDocument: deviceConnectPolicyDocument,
      policyName: "DeviceConnectPolicy"
    });

    const mobileAppPolicyProps: Array<CfnPolicyProps> = [];
    const mobileAppPublishPolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Publish",
            "iot:RetainPublish"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowGetTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateTopic}`,
          ]
        }
      ]
    };
    mobileAppPolicyProps.push( {
      policyDocument: mobileAppPublishPolicyDocument,
      policyName: "MobileAppPublishPolicy"
    });
    const mobileAppReceivePolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Receive"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topic/${clientId}/logging`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowUpdateDocumentsTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowGetAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topic/${thingShadowGetRejectedTopic}`,
          ]
        }
      ]
    };
    mobileAppPolicyProps.push( {
      policyDocument: mobileAppReceivePolicyDocument,
      policyName: "MobileAppReceivePolicy"
    });
    const mobileAppSubscribePolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": [
            "iot:Subscribe"
          ],
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${clientId}/logging`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateRejectedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDeltaTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowUpdateDocumentsTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowGetAcceptedTopic}`,
            `arn:aws:iot:${this.region}:${this.account}:topicfilter/${thingShadowGetRejectedTopic}`,
          ]
        }
      ]
    };
    mobileAppPolicyProps.push( {
      policyDocument: mobileAppSubscribePolicyDocument,
      policyName: "MobileAppSubscribePolicy"
    });
    const mobileAppConnectPolicyDocument = {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Effect": "Allow",
          "Action": "iot:Connect",
          "Resource": [
            `arn:aws:iot:${this.region}:${this.account}:client/${mobileAppName}`
          ]
        }
      ]
    }
    mobileAppPolicyProps.push( {
      policyDocument: mobileAppConnectPolicyDocument,
      policyName: "MobileAppConnectPolicy"
    });

    devicePolicyProps.forEach((policyProps) => {
      const cfnPolicy = new iot.CfnPolicy(this, `CfnPolicy_device_${policyProps.policyName}`, policyProps);

      const cfnPolicyPrincipalAttachment = new iot.CfnPolicyPrincipalAttachment(this,
        `CfnPolicyPrincipalAttachment_device_${policyProps.policyName}`, {
          policyName: cfnPolicy.policyName!.toString(),
          principal: deviceCertificateArn
        }
      );

      cfnPolicyPrincipalAttachment.addDependsOn(cfnPolicy);

      const cfnThingPrincipalAttachment = new iot.CfnThingPrincipalAttachment(this,
        `CfnThingPrincipalAttachment_device_${policyProps.policyName}`,
        {
          thingName: deviceThing.thingName!.toString(),
          principal: deviceCertificateArn
        }
      );

      cfnThingPrincipalAttachment.addDependsOn(deviceThing);
    });

    mobileAppPolicyProps.forEach((policyProps) => {
      const cfnPolicy = new iot.CfnPolicy(this, `CfnPolicy_mobile_app_${policyProps.policyName}`, policyProps);

      const cfnPolicyPrincipalAttachment = new iot.CfnPolicyPrincipalAttachment(this,
        `CfnPolicyPrincipalAttachment_mobile_app_${policyProps.policyName}`, {
          policyName: cfnPolicy.policyName!.toString(),
          principal: mobileAppCertificateArn
        }
      );

      cfnPolicyPrincipalAttachment.addDependsOn(cfnPolicy);

      const cfnThingPrincipalAttachment = new iot.CfnThingPrincipalAttachment(this,
        `CfnThingPrincipalAttachment_mobile_app_${policyProps.policyName}`,
        {
          thingName: mobileAppThing.thingName!.toString(),
          principal: mobileAppCertificateArn
        }
      );

      cfnThingPrincipalAttachment.addDependsOn(mobileAppThing);
    });
  }
}

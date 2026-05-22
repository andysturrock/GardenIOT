import { describe, test, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { IOTStack } from '../lib/iot-stack';

const CLIENT_ID = process.env.CLIENT_ID!;
const MOBILE_APP_NAME = process.env.MOBILE_APP_NAME!;
const DEVICE_CERT_ARN = process.env.DEVICE_CERT_ARN!;
const MOBILE_APP_CERT_ARN = process.env.MOBILE_APP_CERT_ARN!;

function synth(): Template {
  const app = new App();
  const stack = new IOTStack(app, 'TestIOTStack');
  return Template.fromStack(stack);
}

describe('IOTStack', () => {
  describe('Things + log group + topic rule', () => {
    test('creates a Thing for the device AND a Thing for the mobile app', () => {
      const template = synth();
      template.resourceCountIs('AWS::IoT::Thing', 2);
      template.hasResourceProperties('AWS::IoT::Thing', { ThingName: CLIENT_ID });
      template.hasResourceProperties('AWS::IoT::Thing', { ThingName: MOBILE_APP_NAME });
    });

    test('Status log group has 2-year retention (operator-set)', () => {
      synth().hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: 'Status',
        RetentionInDays: 731,
      });
    });

    test('LoggingTopicRule routes ${CLIENT_ID}/logging to CloudWatch', () => {
      const template = synth();
      template.resourceCountIs('AWS::IoT::TopicRule', 1);
      template.hasResourceProperties('AWS::IoT::TopicRule', Match.objectLike({
        RuleName: 'LoggingTopicRule',
        TopicRulePayload: Match.objectLike({
          Sql: `SELECT * FROM '${CLIENT_ID}/logging'`,
        }),
      }));
    });
  });

  describe('Device policies (4)', () => {
    test('creates 4 named device policies', () => {
      const template = synth();
      for (const name of ['DevicePublishPolicy', 'DeviceReceivePolicy', 'DeviceSubscribePolicy', 'DeviceConnectPolicy']) {
        template.hasResourceProperties('AWS::IoT::Policy', { PolicyName: name });
      }
    });

    test('DevicePublishPolicy includes /logging AND /status AND shadow update topics (post-audit C3 fix)', () => {
      const template = synth();
      const policies = template.findResources('AWS::IoT::Policy');
      const publishPolicy = Object.values(policies).find(
        (p: any) => p.Properties.PolicyName === 'DevicePublishPolicy',
      ) as any;
      expect(publishPolicy).toBeDefined();

      const resources: string[] = publishPolicy.Properties.PolicyDocument.Statement[0].Resource;
      const joined = JSON.stringify(resources);
      expect(joined).toContain(`topic/${CLIENT_ID}/logging`);
      expect(joined).toContain(`topic/${CLIENT_ID}/status`);
      expect(joined).toContain('shadow/name/*/update');
    });

    test('DeviceConnectPolicy scopes the Connect action to the device clientId', () => {
      const template = synth();
      const policies = template.findResources('AWS::IoT::Policy');
      const connectPolicy = Object.values(policies).find(
        (p: any) => p.Properties.PolicyName === 'DeviceConnectPolicy',
      ) as any;

      const stmt = connectPolicy.Properties.PolicyDocument.Statement[0];
      expect(stmt.Action).toBe('iot:Connect');
      expect(JSON.stringify(stmt.Resource)).toContain(`client/${CLIENT_ID}`);
    });
  });

  describe('Mobile-app policies (4)', () => {
    test('creates 4 named mobile-app policies', () => {
      const template = synth();
      for (const name of ['MobileAppPublishPolicy', 'MobileAppReceivePolicy', 'MobileAppSubscribePolicy', 'MobileAppConnectPolicy']) {
        template.hasResourceProperties('AWS::IoT::Policy', { PolicyName: name });
      }
    });

    test('MobileAppReceivePolicy includes /logging AND /status', () => {
      const template = synth();
      const policies = template.findResources('AWS::IoT::Policy');
      const receive = Object.values(policies).find(
        (p: any) => p.Properties.PolicyName === 'MobileAppReceivePolicy',
      ) as any;

      const joined = JSON.stringify(receive.Properties.PolicyDocument.Statement[0].Resource);
      expect(joined).toContain(`topic/${CLIENT_ID}/logging`);
      expect(joined).toContain(`topic/${CLIENT_ID}/status`);
    });

    test('MobileAppSubscribePolicy uses topicfilter (not topic) and includes /status', () => {
      const template = synth();
      const policies = template.findResources('AWS::IoT::Policy');
      const sub = Object.values(policies).find(
        (p: any) => p.Properties.PolicyName === 'MobileAppSubscribePolicy',
      ) as any;

      const joined = JSON.stringify(sub.Properties.PolicyDocument.Statement[0].Resource);
      expect(joined).toContain('topicfilter');
      expect(joined).toContain(`topicfilter/${CLIENT_ID}/status`);
    });

    test('MobileAppConnectPolicy scopes the Connect action to the mobile app client', () => {
      const template = synth();
      const policies = template.findResources('AWS::IoT::Policy');
      const connect = Object.values(policies).find(
        (p: any) => p.Properties.PolicyName === 'MobileAppConnectPolicy',
      ) as any;

      const stmt = connect.Properties.PolicyDocument.Statement[0];
      expect(stmt.Action).toBe('iot:Connect');
      expect(JSON.stringify(stmt.Resource)).toContain(`client/${MOBILE_APP_NAME}`);
    });
  });

  describe('Cert attachments', () => {
    test('each of the 8 policies is attached to its cert via PolicyPrincipalAttachment', () => {
      const template = synth();
      template.resourceCountIs('AWS::IoT::PolicyPrincipalAttachment', 8);
    });

    test('each of the 8 policies has a Thing-Principal attachment alongside (8 total)', () => {
      const template = synth();
      template.resourceCountIs('AWS::IoT::ThingPrincipalAttachment', 8);
    });

    test('device cert ARN appears in all 4 device PolicyPrincipalAttachments', () => {
      const template = synth();
      const attachments = template.findResources('AWS::IoT::PolicyPrincipalAttachment');
      const deviceAttachments = Object.values(attachments).filter(
        (a: any) => a.Properties.Principal === DEVICE_CERT_ARN,
      );
      expect(deviceAttachments).toHaveLength(4);
    });

    test('mobile-app cert ARN appears in all 4 mobile PolicyPrincipalAttachments', () => {
      const template = synth();
      const attachments = template.findResources('AWS::IoT::PolicyPrincipalAttachment');
      const mobileAttachments = Object.values(attachments).filter(
        (a: any) => a.Properties.Principal === MOBILE_APP_CERT_ARN,
      );
      expect(mobileAttachments).toHaveLength(4);
    });
  });
});

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { IAMStack } from '../lib/iam-stack';

describe('IAMStack', () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.AWS_AUTOMATION_ROLE_ARN;
    delete process.env.AWS_AUTOMATION_GROUP_ARN;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  test('synthesises an empty stack when neither role nor group env var is set', () => {
    const app = new App();
    const stack = new IAMStack(app, 'TestIAMStack');
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::IAM::Policy', 0);
  });

  test('attaches an AutomationRolePolicy to the given role when AWS_AUTOMATION_ROLE_ARN is set', () => {
    process.env.AWS_AUTOMATION_ROLE_ARN = 'arn:aws:iam::123456789012:role/automation';
    const app = new App();
    const stack = new IAMStack(app, 'TestIAMStack');
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::IAM::Policy', 1);
    template.hasResourceProperties('AWS::IAM::Policy', {
      Roles: Match.arrayWith(['automation']),
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Sid: 'AllowAutomationOperations',
            Effect: 'Allow',
          }),
        ]),
      }),
    });
  });

  test('attaches an AutomationGroupPolicy when AWS_AUTOMATION_GROUP_ARN is set', () => {
    process.env.AWS_AUTOMATION_GROUP_ARN = 'arn:aws:iam::123456789012:group/automation';
    const app = new App();
    const stack = new IAMStack(app, 'TestIAMStack');
    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::IAM::Policy', 1);
    template.hasResourceProperties('AWS::IAM::Policy', {
      Groups: Match.arrayWith(['automation']),
      PolicyName: 'AUTOMATION_policy',
    });
  });

  test('attaches BOTH policies when both env vars are set (fixed dup-logical-id bug)', () => {
    process.env.AWS_AUTOMATION_ROLE_ARN = 'arn:aws:iam::123456789012:role/automation';
    process.env.AWS_AUTOMATION_GROUP_ARN = 'arn:aws:iam::123456789012:group/automation';
    const app = new App();
    // The original IAMStack used duplicate logical IDs "Role"/"Policy"
    // which made this throw. After the fix, both attachments coexist.
    expect(() => new IAMStack(app, 'TestIAMStack')).not.toThrow();
    const stack = new IAMStack(new App(), 'TestIAMStack2');
    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::IAM::Policy', 2);
  });

  test('granted policy includes the expected automation actions', () => {
    process.env.AWS_AUTOMATION_ROLE_ARN = 'arn:aws:iam::123456789012:role/automation';
    const app = new App();
    const stack = new IAMStack(app, 'TestIAMStack');
    const template = Template.fromStack(stack);

    // Spot-check a handful of actions; full list lives in iam-stack.ts.
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: Match.objectLike({
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith([
              'cloudformation:CreateChangeSet',
              'lambda:CreateFunction',
              'route53:ChangeResourceRecordSets',
              'dynamodb:CreateTable',
            ]),
            Resource: '*',
          }),
        ]),
      }),
    });
  });
});

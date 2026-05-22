import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DynamoDBStack } from '../lib/dynamodb-stack';
import { LambdaStack } from '../lib/lambda-stack';

function buildStack(): Template {
  const app = new App();
  const ddb = new DynamoDBStack(app, 'TestDdb');
  const stack = new LambdaStack(app, 'TestLambdaStack', {
    temperatureHistoryTable: ddb.temperatureHistoryTable,
  });
  return Template.fromStack(stack);
}

describe('LambdaStack', () => {
  const originalBoundary = process.env.AWS_BOUNDARY_POLICY_ARN;
  beforeEach(() => {
    delete process.env.AWS_BOUNDARY_POLICY_ARN;
  });
  afterEach(() => {
    process.env.AWS_BOUNDARY_POLICY_ARN = originalBoundary;
  });

  describe('Lambda functions', () => {
    test('creates exactly 2 lambdas (Get + Post; moisture removed)', () => {
      const template = buildStack();
      const fns = template.findResources('AWS::Lambda::Function');
      const business = Object.values(fns).filter((f: any) => {
        const handler = f.Properties?.Handler ?? '';
        return handler.startsWith('temperature_');
      });
      expect(business).toHaveLength(2);
    });

    test('lambdas run on Node 20 + arm64 with explicit log group + sane memory/timeout', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
        Handler: 'temperature_get.lambdaHandler',
        Runtime: 'nodejs20.x',
        Architectures: ['arm64'],
        MemorySize: 256,
        Timeout: 10,
        LoggingConfig: Match.objectLike({
          LogGroup: Match.anyValue(),
        }),
      }));
      template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
        Handler: 'temperature_post.lambdaHandler',
        Runtime: 'nodejs20.x',
        Architectures: ['arm64'],
      }));
    });

    test('lambdas receive the TEMPERATURE_HISTORY_TABLE env var', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
        Handler: 'temperature_get.lambdaHandler',
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            TEMPERATURE_HISTORY_TABLE: Match.anyValue(),
          }),
        }),
      }));
    });

    test('each lambda has its own log group with 1-month retention', () => {
      const template = buildStack();
      const groups = template.findResources('AWS::Logs::LogGroup');
      // 2 explicit Lambda log groups (Get + Post)
      const ours = Object.values(groups).filter((g: any) => {
        const name = g.Properties?.LogGroupName ?? '';
        return name.includes('TemperatureGetLambda') || name.includes('TemperaturePostLambda');
      });
      expect(ours).toHaveLength(2);
      for (const group of ours) {
        expect((group as any).Properties.RetentionInDays).toBe(30);
      }
    });
  });

  describe('IAM grants', () => {
    test('the Get lambda gets read-only DynamoDB grants', () => {
      const template = buildStack();
      const policies = template.findResources('AWS::IAM::Policy');
      const getPolicy = Object.values(policies).find((p: any) => {
        const roles: unknown[] = p.Properties?.Roles ?? [];
        return roles.some((r: any) => JSON.stringify(r).includes('TemperatureGetLambdaServiceRole'));
      });
      expect(getPolicy).toBeDefined();
      const actions: string[] = (getPolicy as any).Properties.PolicyDocument.Statement
        .flatMap((s: any) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
      expect(actions).toContain('dynamodb:Query');
      expect(actions).not.toContain('dynamodb:PutItem');
    });

    test('the Post lambda gets read+write DynamoDB grants', () => {
      const template = buildStack();
      const policies = template.findResources('AWS::IAM::Policy');
      const postPolicy = Object.values(policies).find((p: any) => {
        const roles: unknown[] = p.Properties?.Roles ?? [];
        return roles.some((r: any) => JSON.stringify(r).includes('TemperaturePostLambdaServiceRole'));
      });
      expect(postPolicy).toBeDefined();
      const actions: string[] = (postPolicy as any).Properties.PolicyDocument.Statement
        .flatMap((s: any) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
      expect(actions).toContain('dynamodb:PutItem');
    });
  });

  describe('API Gateway', () => {
    test('creates a single REST API named "Garden IOT Service"', () => {
      const template = buildStack();
      template.resourceCountIs('AWS::ApiGateway::RestApi', 1);
      template.hasResourceProperties('AWS::ApiGateway::RestApi', {
        Name: 'Garden IOT Service',
      });
    });

    test('GET /temperature does NOT require an API key (mobile app reads freely)', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::ApiGateway::Method', Match.objectLike({
        HttpMethod: 'GET',
        ApiKeyRequired: Match.absent(),
      }));
    });

    test('POST /temperature DOES require an API key', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::ApiGateway::Method', Match.objectLike({
        HttpMethod: 'POST',
        ApiKeyRequired: true,
      }));
    });

    test('creates an ApiKey + UsagePlan tied to the stage', () => {
      const template = buildStack();
      template.resourceCountIs('AWS::ApiGateway::ApiKey', 1);
      template.resourceCountIs('AWS::ApiGateway::UsagePlan', 1);
      template.hasResourceProperties('AWS::ApiGateway::UsagePlan', Match.objectLike({
        Throttle: { RateLimit: 5, BurstLimit: 10 },
        Quota: Match.objectLike({ Limit: 10000, Period: 'DAY' }),
      }));
    });

    test('stage has dataTraceEnabled=false and loggingLevel=ERROR (security audit fixes)', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::ApiGateway::Stage', Match.objectLike({
        MethodSettings: Match.arrayWith([
          Match.objectLike({
            DataTraceEnabled: false,
            LoggingLevel: 'ERROR',
          }),
        ]),
      }));
    });
  });

  describe('Custom domain + cert', () => {
    test('creates an ACM cert for api.${CUSTOM_DOMAIN_NAME} via DNS validation', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::CertificateManager::Certificate', Match.objectLike({
        DomainName: `api.${process.env.CUSTOM_DOMAIN_NAME}`,
        ValidationMethod: 'DNS',
      }));
    });

    test('creates an API Gateway DomainName + Route53 A-record alias', () => {
      const template = buildStack();
      template.resourceCountIs('AWS::ApiGateway::DomainName', 1);
      template.hasResourceProperties('AWS::Route53::RecordSet', Match.objectLike({
        Name: `api.${process.env.CUSTOM_DOMAIN_NAME}.`,
        Type: 'A',
      }));
    });

    test('base path mapping uses the lambda version (dots → underscores)', () => {
      const template = buildStack();
      const versionForUrl = process.env.LAMBDA_VERSION!.replace(/\./g, '_');
      template.hasResourceProperties('AWS::ApiGateway::BasePathMapping', Match.objectLike({
        BasePath: versionForUrl,
      }));
    });
  });

  describe('Permission boundary (optional)', () => {
    test('NOT applied to lambda roles when AWS_BOUNDARY_POLICY_ARN is unset', () => {
      const template = buildStack();
      const roles = template.findResources('AWS::IAM::Role');
      for (const role of Object.values(roles)) {
        expect((role as any).Properties.PermissionsBoundary).toBeUndefined();
      }
    });

    test('IS applied to lambda roles when AWS_BOUNDARY_POLICY_ARN is set', () => {
      process.env.AWS_BOUNDARY_POLICY_ARN = 'arn:aws:iam::123456789012:policy/my-boundary';
      const template = buildStack();
      const roles = template.findResources('AWS::IAM::Role');
      const lambdaRoles = Object.values(roles).filter((r: any) =>
        JSON.stringify(r.Properties?.AssumeRolePolicyDocument ?? {}).includes('lambda.amazonaws.com'),
      );
      expect(lambdaRoles.length).toBeGreaterThan(0);
      for (const role of lambdaRoles) {
        expect((role as any).Properties.PermissionsBoundary).toBeDefined();
      }
    });
  });
});

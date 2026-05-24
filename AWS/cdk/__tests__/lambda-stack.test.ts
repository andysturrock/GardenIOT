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
    logTable: ddb.logTable,
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
    test('creates 3 business lambdas: temperature Get + Post + logs Get', () => {
      const template = buildStack();
      const fns = template.findResources('AWS::Lambda::Function');
      const business = Object.values(fns).filter((f: any) => {
        const handler = f.Properties?.Handler ?? '';
        return handler.startsWith('temperature_') || handler.startsWith('logs_');
      });
      expect(business).toHaveLength(3);
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

    test('logs_get lambda receives GARDEN_LOG_TABLE + GARDEN_DEVICE_ID', () => {
      const template = buildStack();
      template.hasResourceProperties('AWS::Lambda::Function', Match.objectLike({
        Handler: 'logs_get.lambdaHandler',
        Environment: Match.objectLike({
          Variables: Match.objectLike({
            GARDEN_LOG_TABLE: Match.anyValue(),
            GARDEN_DEVICE_ID: process.env.CLIENT_ID,
          }),
        }),
      }));
    });

    test('each lambda has its own log group with 1-month retention', () => {
      const template = buildStack();
      const groups = template.findResources('AWS::Logs::LogGroup');
      // 3 explicit Lambda log groups (Get + Post + LogsGet)
      const ours = Object.values(groups).filter((g: any) => {
        const name = g.Properties?.LogGroupName ?? '';
        return name.includes('TemperatureGetLambda')
          || name.includes('TemperaturePostLambda')
          || name.includes('LogsGetLambda');
      });
      expect(ours).toHaveLength(3);
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

    test('the LogsGet lambda gets read-only DynamoDB grants on GardenLogTable', () => {
      const template = buildStack();
      const policies = template.findResources('AWS::IAM::Policy');
      const logsPolicy = Object.values(policies).find((p: any) => {
        const roles: unknown[] = p.Properties?.Roles ?? [];
        return roles.some((r: any) => JSON.stringify(r).includes('LogsGetLambdaServiceRole'));
      });
      expect(logsPolicy).toBeDefined();
      const actions: string[] = (logsPolicy as any).Properties.PolicyDocument.Statement
        .flatMap((s: any) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
      expect(actions).toContain('dynamodb:Query');
      expect(actions).not.toContain('dynamodb:PutItem');
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

    test('GET /logs resource is wired and does NOT require an API key', () => {
      const template = buildStack();
      const resources = template.findResources('AWS::ApiGateway::Resource');
      const logsResource = Object.values(resources).find(
        (r: any) => r.Properties?.PathPart === 'logs',
      );
      expect(logsResource).toBeDefined();

      // Find the GET method on the logs resource (matched via the LambdaIntegration's logs_get URI)
      const methods = template.findResources('AWS::ApiGateway::Method');
      const logsGet = Object.values(methods).find((m: any) => {
        if (m.Properties?.HttpMethod !== 'GET') return false;
        const uri = JSON.stringify(m.Properties?.Integration?.Uri ?? {});
        return uri.includes('LogsGetLambda');
      });
      expect(logsGet).toBeDefined();
      expect((logsGet as any).Properties.ApiKeyRequired).toBeUndefined();
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

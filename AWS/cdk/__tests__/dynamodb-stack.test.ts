import { describe, test, expect } from 'vitest';
import { App } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { DynamoDBStack } from '../lib/dynamodb-stack';

describe('DynamoDBStack', () => {
  function synth(): Template {
    const app = new App();
    const stack = new DynamoDBStack(app, 'TestDynamoStack');
    return Template.fromStack(stack);
  }

  test('creates 2 DynamoDB tables: TemperatureHistory + GardenLog', () => {
    synth().resourceCountIs('AWS::DynamoDB::Table', 2);
  });

  test('TemperatureHistory has sensor_id (NUMBER) HASH + timestamp (NUMBER) RANGE — the audit-fixed schema', () => {
    synth().hasResourceProperties('AWS::DynamoDB::Table', {
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'sensor_id', AttributeType: 'N' },
        { AttributeName: 'timestamp', AttributeType: 'N' },
      ]),
      KeySchema: [
        { AttributeName: 'sensor_id', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' },
      ],
    });
  });

  test('uses PAY_PER_REQUEST billing (no provisioned capacity)', () => {
    const template = synth();
    const tables = template.findResources('AWS::DynamoDB::Table');
    for (const t of Object.values(tables)) {
      expect((t as any).Properties.BillingMode).toBe('PAY_PER_REQUEST');
      expect((t as any).Properties.ProvisionedThroughput).toBeUndefined();
    }
  });

  test('does NOT hardcode a TableName (so future schema changes can recreate cleanly)', () => {
    const template = synth();
    const tables = template.findResources('AWS::DynamoDB::Table');
    for (const t of Object.values(tables)) {
      expect((t as any).Properties.TableName).toBeUndefined();
    }
  });

  test('RemovalPolicy is DESTROY on both tables', () => {
    const template = synth();
    const tables = template.findResources('AWS::DynamoDB::Table');
    for (const t of Object.values(tables)) {
      expect((t as any).DeletionPolicy).toBe('Delete');
      expect((t as any).UpdateReplacePolicy).toBe('Delete');
    }
  });

  test('GardenLogTable: pk (STRING) HASH + timestamp (NUMBER) RANGE, with TTL on `ttl`', () => {
    const template = synth();
    template.hasResourceProperties('AWS::DynamoDB::Table', Match.objectLike({
      AttributeDefinitions: Match.arrayWith([
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'timestamp', AttributeType: 'N' },
      ]),
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'timestamp', KeyType: 'RANGE' },
      ],
      TimeToLiveSpecification: { AttributeName: 'ttl', Enabled: true },
    }));
  });

  test('stack exposes both tables as public properties', () => {
    const app = new App();
    const stack = new DynamoDBStack(app, 'TestDynamoStack');
    expect(stack.temperatureHistoryTable).toBeDefined();
    expect(stack.temperatureHistoryTable.tableName).toBeDefined();
    expect(stack.logTable).toBeDefined();
    expect(stack.logTable.tableName).toBeDefined();
  });
});

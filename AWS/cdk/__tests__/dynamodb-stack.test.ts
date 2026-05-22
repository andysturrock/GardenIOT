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

  test('creates exactly one DynamoDB table (legacy V1 + LastSensorReading were deleted)', () => {
    synth().resourceCountIs('AWS::DynamoDB::Table', 1);
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
    synth().hasResourceProperties('AWS::DynamoDB::Table', {
      BillingMode: 'PAY_PER_REQUEST',
    });
    // ProvisionedThroughput must NOT be set under PAY_PER_REQUEST.
    synth().hasResourceProperties('AWS::DynamoDB::Table', Match.objectLike({
      ProvisionedThroughput: Match.absent(),
    }));
  });

  test('does NOT hardcode a TableName (so future schema changes can recreate cleanly)', () => {
    synth().hasResourceProperties('AWS::DynamoDB::Table', Match.objectLike({
      TableName: Match.absent(),
    }));
  });

  test('RemovalPolicy is DESTROY (hobby data; safe to throw away on stack delete)', () => {
    const template = synth();
    const tables = template.findResources('AWS::DynamoDB::Table');
    const [resource] = Object.values(tables);
    expect(resource.DeletionPolicy).toBe('Delete');
    expect(resource.UpdateReplacePolicy).toBe('Delete');
  });

  test('stack exposes the table as a public property', () => {
    const app = new App();
    const stack = new DynamoDBStack(app, 'TestDynamoStack');
    expect(stack.temperatureHistoryTable).toBeDefined();
    expect(stack.temperatureHistoryTable.tableName).toBeDefined();
  });
});

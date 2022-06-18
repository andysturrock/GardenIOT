import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import { App } from 'aws-cdk-lib';
import { LambdaStack } from '../lib/lambda-stack';
import { DynamoDBStack } from '../lib/dynamodb-stack';

test('Empty Stack', () => {
    const app = new App();
    // WHEN
    const dynamoDBStack = new DynamoDBStack(app, 'DynamoDBStack');
    const stack = new LambdaStack(app, 'MyTestStack', {
      temperatureHistoryTable: dynamoDBStack.temperatureHistoryTable,
      lastSensorReadingTable: dynamoDBStack.lastSensorReadingTable
    });
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});

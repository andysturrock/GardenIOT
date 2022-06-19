import { StackProps } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';

import * as dotenv from 'dotenv';
dotenv.config();

export interface LambdaStackProps extends StackProps {
  readonly temperatureHistoryTable: dynamodb.Table;
  readonly lastSensorReadingTable: dynamodb.Table;
}

// Returns value of given environment variable, which may be read from .env file.
// If the optional flag is passed as true, then if the variable is not set then undefined is returned.
// Thus it is safe to use ! to assert a variable is not undefined if the optional flag is true or missing.
// If optional is missing or false then if the variable is missing an exception is thrown.
export function getEnv(name: string, optional: boolean = false): string | undefined {
  const val = process.env[name];
  if (!val && !optional) {
      console.error(`${name} env var not set`);
      throw new Error(`${name} env var not set`);
  }
  return val;
}

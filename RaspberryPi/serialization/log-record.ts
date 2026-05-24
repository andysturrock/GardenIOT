/**
 * Shape of a single log message published on the Pi's `${CLIENT_ID}/logging`
 * topic. Consumed by the AWS IoT topic rule that fans out to CloudWatch
 * (today) and DynamoDB (stage 6). See docs/garden-config-shadow-plan.md
 * for the rollout.
 *
 * Two `category` values exist:
 *   - `user`      operator-visible events ("Watering ... completed").
 *   - `technical` everything else (MQTT plumbing, GPIO toggles, etc.).
 *
 * The app's Logs tab (stage 7) shows user-tier by default and switches
 * to the technical firehose on request.
 */

export type LogCategory = 'user' | 'technical';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  device_id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta?: Record<string, unknown>;
}

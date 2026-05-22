// All CDK stacks read env vars at construction time via getEnv().
// Seed them with valid-looking placeholder values before any source
// module gets imported.

process.env.CLIENT_ID = 'raspberrypi-test';
process.env.DEVICE_CERT_ARN = 'arn:aws:iot:eu-west-1:123456789012:cert/device-test';
process.env.MOBILE_APP_NAME = 'test-mobile-app';
process.env.MOBILE_APP_CERT_ARN = 'arn:aws:iot:eu-west-1:123456789012:cert/mobile-test';

process.env.CUSTOM_DOMAIN_NAME = 'test.example.com';
process.env.R53_ZONE_ID = 'Z0000000000000000000T';
process.env.LAMBDA_VERSION = '0.0.1';

// Optional env vars left unset; the conditional branches cover both
// cases (see iam-stack and lambda-stack tests).
delete process.env.AWS_AUTOMATION_ROLE_ARN;
delete process.env.AWS_AUTOMATION_GROUP_ARN;
delete process.env.AWS_BOUNDARY_POLICY_ARN;

// Runs before any test module is loaded. Sets the env vars that
// module-load-time `getEnv(..., false)` calls in mqtt-logger,
// aws-connection and relay otherwise crash on.
process.env.MOCK_GPIO     = '1';
process.env.CLIENT_ID     = 'test-client';
process.env.LOGGING_TOPIC = 'test/logging';
process.env.CERTFILE      = '/dev/null';
process.env.KEYFILE       = '/dev/null';
process.env.CAFILE        = '/dev/null';
process.env.ENDPOINT      = 'localhost';

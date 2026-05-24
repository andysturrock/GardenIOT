// Handlers read these env vars at module load time. Seed them before any
// source module gets imported.
process.env.TEMPERATURE_HISTORY_TABLE = 'TemperatureHistoryTestTable';
process.env.GARDEN_LOG_TABLE = 'GardenLogTestTable';
process.env.GARDEN_DEVICE_ID = 'raspberrypi-test';
process.env.AWS_REGION = 'eu-west-1';

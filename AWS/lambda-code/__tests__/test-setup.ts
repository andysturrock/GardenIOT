// Both handlers read TEMPERATURE_HISTORY_TABLE at module load time.
// Seed it before any source module gets imported.
process.env.TEMPERATURE_HISTORY_TABLE = 'TemperatureHistoryTestTable';
process.env.AWS_REGION = 'eu-west-1';

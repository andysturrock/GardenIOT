# GardenIOT — Lambda handlers

API Gateway-fronted Lambda functions for the things the Flutter app needs
but the Pi shouldn't serve directly: historical temperature data and the
log archive.

## Handlers

| Handler | Triggered by | Reads / writes |
|---------|--------------|----------------|
| [`temperature_get.ts`](src/temperature_get.ts) | `GET /temperature` | Reads `TemperatureHistoryTable` (DynamoDB) for the dials and history graphs |
| [`temperature_post.ts`](src/temperature_post.ts) | `POST /temperature` | Ingests sensor readings into `TemperatureHistoryTable` |
| [`logs_get.ts`](src/logs_get.ts) | `GET /logs?category=user\|technical&before=<ms>&limit=<n>` | Paginated query over `GardenLogTable` for the app's dual-stream Logs tab. Backs the same `LogRecord` shape the Pi publishes; rows are TTL'd after 90 days by the IoT rule that writes them |

The CDK stack ([`AWS/cdk/lib/lambda-stack.ts`](../cdk/lib/lambda-stack.ts))
wires each handler up with its routes, env vars (`GARDEN_LOG_TABLE`,
`GARDEN_DEVICE_ID`, `TEMPERATURE_HISTORY_TABLE`), and least-privilege
DynamoDB grants.

## Build & test

```bash
npm ci
npm test               # vitest
npm run test:coverage  # 95% line/statement threshold enforced via vitest.config.ts
npm run build          # tsc + esbuild bundle -> dist/lambda.zip
```

`dist/lambda.zip` is what the CDK `LambdaStack` deploys via
`lambda.Code.fromAsset("../lambda-code/dist/lambda.zip")`. CI builds it
before running the CDK snapshot-style assertion tests; locally, run
`npm run build` once before `cd ../cdk && npm test`.

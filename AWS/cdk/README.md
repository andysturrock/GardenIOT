# GardenIOT — CDK

AWS infrastructure for GardenIOT. Four stacks, deployed independently
but wired together at the app level in [`bin/cdk.ts`](bin/cdk.ts).

## Stacks

| Stack | What it owns |
|-------|--------------|
| [`IAMStack`](lib/iam-stack.ts) | Deploy-role / boundary policy plumbing |
| [`DynamoDBStack`](lib/dynamodb-stack.ts) | `TemperatureHistoryTableV2` (sensor readings) and `GardenLogTable` (per-device, per-category log archive with 90-day TTL) |
| [`LambdaStack`](lib/lambda-stack.ts) | `temperature_get` / `temperature_post` / `logs_get` Lambdas, API Gateway (`GET /temperature`, `POST /temperature`, `GET /logs`), custom domain + ACM cert + Route53 alias, API key + usage plan on `POST /temperature` |
| [`IOTStack`](lib/iot-stack.ts) | IoT Things (device + mobile app), per-principal IoT policies (publish / subscribe / receive / connect), and two topic rules on `${CLIENT_ID}/logging`: `LoggingTopicRule` → CloudWatch, `LoggingDynamoRule` → `GardenLogTable` |

The mobile app currently uses its own IoT Thing + cert shipped inside the
app bundle — a known limitation tracked in the top-level
[CLAUDE.md](../../CLAUDE.md). Eventual fix is per-user Cognito identity.

## Env vars (`.env` at this directory)

| Var | Used by | Notes |
|-----|---------|-------|
| `CLIENT_ID` | IOT, Lambda | Device Thing name; also the MQTT topic prefix and `GARDEN_DEVICE_ID` env var on the Lambdas |
| `DEVICE_CERT_ARN` | IOT | ARN of the device certificate (created out of band in the IoT console) |
| `MOBILE_APP_NAME` | IOT | Mobile app Thing name (also used as MQTT client id) |
| `MOBILE_APP_CERT_ARN` | IOT | ARN of the mobile app certificate |
| `CUSTOM_DOMAIN_NAME` | Lambda | e.g. `example.com` — API is served at `api.<this>` |
| `R53_ZONE_ID` | Lambda | Route53 hosted zone for the custom domain |
| `LAMBDA_VERSION` | Lambda | Semver string baked into the API Gateway stage name (dots → underscores) |
| `AWS_BOUNDARY_POLICY_ARN` | Lambda | Optional — applied as a permissions boundary if set |

## Build & test

```bash
npm ci
npm test               # vitest — assertion-style stack synth tests, no snapshots
npm run test:coverage  # 95% line/statement threshold enforced via vitest.config.ts
npm run build          # tsc
```

The Lambda stack's `lambda.Code.fromAsset("../lambda-code/dist/lambda.zip")`
means `cdk synth` (and therefore the tests) needs that zip to exist. Run
`cd ../lambda-code && npm run build` once locally before the first test
run; CI creates a stub. See the top-level [CLAUDE.md](../../CLAUDE.md)
"Quirks you will hit".

## Deploy

```bash
npm run build
npx cdk diff
npx cdk deploy --all
```

Stacks deploy in dependency order; `DynamoDBStack` first (the table
references are passed as constructor props to `LambdaStack` and
`IOTStack`).

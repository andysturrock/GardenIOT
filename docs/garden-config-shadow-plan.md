# Bed names + editable watering plan, stored in AWS

## Context

Four related gaps:

1. **Bed names are hardcoded in the app.** [`AppConfig.relays`](../UI/garden_iot/lib/utils/env.dart#L54-L64) pins `Greenhouse / Flowers / Strawberries / Sweetcorn` at build time. Renaming a bed needs a rebuild and store re-submission.
2. **The watering schedule is hardcoded in the Pi.** [`index.ts:63-80`](../RaspberryPi/index.ts#L63-L80) builds two `WateringJob`s at startup (08:00 RELAY1+2, 08:10 RELAY3+4, each for 5 minutes). [`WateringPlan.load()`](../RaspberryPi/watering-plan.ts#L22-L27) exists but is never called — a half-built file-store API that's dead code in production.
3. **Nothing about names or schedule lives in AWS.** Reconfiguring the garden requires editing source + redeploying the Pi (and the app, for names).
4. **The Logs tab is a session-only 50-message ring buffer.** [`LogModel`](../UI/garden_iot/lib/log_model.dart) only sees MQTT log messages received while the app is open and connected; close the app, lose the history. There's also no distinction between *operational* events the user cares about ("Morning veg watered at 08:05") and *technical* events for debugging (every relay open/close, every MQTT subscribe/accepted, etc.). Today everything is one undifferentiated stream of tslog output.

User goals: rename beds in the app, edit the watering plan in the app, persist both in AWS so a fresh Pi or fresh app install picks up the live config, and view a useful history of watering events (with infinite scroll back to the data-retention horizon) separated from the firehose of technical events.

## Approach — named IoT Thing Shadow as the source of truth

Add one new named shadow on the existing Pi Thing (`raspberrypi-1`):

```
$aws/things/raspberrypi-1/shadow/name/config
```

Both the app and the Pi already speak MQTT to AWS IoT, both already use named shadows for the per-relay state, and the existing IoT policies in [`iot-stack.ts:20`](../AWS/cdk/lib/iot-stack.ts#L20) wildcard `name/*` — so this new shadow needs **zero new IoT infrastructure, zero new Lambdas, zero new DynamoDB tables**.

Flow:

```
App edits config → publishes `state.desired` to config shadow
                                    │
                                    ▼
                          AWS IoT broker (versions + persists)
                                    │
                                    ▼
              ┌──────────────── delta ────────────────┐
              ▼                                       ▼
   Pi reloads watering plan              Other app instances re-render
   (cancel + re-add node-schedule jobs)  (rename takes effect live)
```

Last-writer-wins via the shadow's `version` field; good enough for a single-user hobby setup.

## Shadow document schema

```jsonc
{
  "version": 1,            // schema version, NOT the shadow version
  "beds": {                // keyed by relay id; relay ids are immutable hardware
    "1": { "name": "Greenhouse" },
    "2": { "name": "Flowers" },
    "3": { "name": "Strawberries" },
    "4": { "name": "Sweetcorn" }
  },
  "jobs": [
    {
      "id": "1716480000000-a4f1",     // stable id; ms-since-epoch + 4 hex chars
      "name": "Morning veg",          // optional, for UI
      "days": [1,2,3,4,5,6,7],         // ISO weekdays: 1=Mon..7=Sun
      "hour": 8,
      "minute": 0,
      "duration_s": 300,
      "relays": [1, 2]
    },
    {
      "id": "1716480000001-b7c2",
      "name": "Morning fruit",
      "days": [1,2,3,4,5,6,7],
      "hour": 8,
      "minute": 10,
      "duration_s": 300,
      "relays": [3, 4]
    }
  ],
  "tz": "Europe/London"
}
```

Notes:
- `version: 1` is **schema** versioning so we can evolve the doc shape without breaking either side. Bump it only on incompatible changes.
- `beds` is a map (not a list) so the app can render any relay even if its name hasn't been edited yet (fall back to `Bed ${id}`).
- `jobs` is an array, not a map — order is meaningful only for UI display, but stable ids on each job let the editor track add/edit/delete cleanly.
- `tz` lives on the doc, not per-job. Single garden, single timezone.

## Stages

Five stages, each independently mergeable. Each stage leaves both the Pi and the app buildable and the existing behaviour working.

---

### Stage 1 — Shared config model + serialization ✅ Complete

Pure refactor + new types. No behaviour change. Lands the contract both sides will agree on.

**Pi — [`RaspberryPi/serialization/`](../RaspberryPi/serialization/):**

Add `garden-config.ts` with TS types matching the schema above:

```ts
export interface GardenConfig {
  version: 1;
  beds: Record<string, { name: string }>;
  jobs: WateringJobConfig[];
  tz: string;
}
export interface WateringJobConfig {
  id: string;
  name?: string;
  days: number[];      // 1..7
  hour: number;        // 0..23
  minute: number;      // 0..59
  duration_s: number;  // > 0
  relays: number[];    // relay ids (1..4)
}
export const SCHEMA_VERSION = 1;
export function parseGardenConfig(raw: unknown): GardenConfig;  // throws on invalid
export function defaultGardenConfig(): GardenConfig;            // the hardcoded seed
```

`parseGardenConfig` does the validation: schema version match, days in 1..7, hour 0..23, etc. Reject early so we never feed garbage to `node-schedule`.

`defaultGardenConfig` returns the current hardcoded plan from [`index.ts`](../RaspberryPi/index.ts) so the Pi has a sensible seed for its first-ever boot.

**App — [`UI/garden_iot/lib/serialization/`](../UI/garden_iot/lib/serialization/):**

Add `garden_config.dart` with the Dart equivalents:

```dart
class GardenConfig { ... factory fromJson(...); Map<String,dynamic> toJson(); ... }
class BedConfig { final String name; ... }
class WateringJobConfig { final String id; final List<int> days; ... }
GardenConfig parseGardenConfig(Map<String, dynamic> raw);   // throws on invalid
const int schemaVersion = 1;
```

The Dart side needs id generation:
```dart
String newJobId() {
  final ms = DateTime.now().millisecondsSinceEpoch;
  final r = Random.secure().nextInt(0xFFFF).toRadixString(16).padLeft(4, '0');
  return '$ms-$r';
}
```

No new package — `dart:math` Random.secure is already available.

**Tests** (both sides): round-trip serialization, validation rejects bad inputs (out-of-range day, duration ≤ 0, unknown schema version), `defaultGardenConfig` matches what `index.ts` currently builds.

**Verification:** `npm test` (Pi), `flutter test` — all green, coverage ≥ 95% maintained.

---

### Stage 2 — Pi reads/writes the config shadow ✅ Complete

The Pi becomes a shadow consumer. Watering plan is rebuilt on every delta. First-ever boot seeds the shadow from the hardcoded default.

**New file — [`RaspberryPi/config-shadow.ts`](../RaspberryPi/config-shadow.ts):**

A `ConfigShadow` class analogous to [`shadow-relay.ts`](../RaspberryPi/shadow-relay.ts) but for the `config` shadow:
- Subscribes to `$aws/things/${CLIENT_ID}/shadow/name/config/{get,update}/{accepted,rejected,delta,documents}`.
- On `init()`, publishes a `get` request.
  - `get/accepted` with a `state.reported.config` → apply.
  - `get/rejected` with `code 404` → no shadow yet; publish `update` with `state.reported = defaultGardenConfig()` AND `state.desired = defaultGardenConfig()` to seed. Then re-`get`.
- On `update/delta` → apply the new desired and publish `state.reported = <new config>` to confirm.
- Tracks `version` like `shadow-relay.ts` already does, ignores stale deltas.
- Exposes `onConfigChanged: (config: GardenConfig) => void` callback for the runtime to consume.

Reuse the existing AWSConnection.

**Update [`RaspberryPi/watering-plan.ts`](../RaspberryPi/watering-plan.ts):**

Replace the half-built file-store API. New surface:
```ts
class WateringPlan {
  constructor(relaysById: Map<number, ShadowRelay>);
  apply(config: GardenConfig): void;  // cancels existing jobs, schedules new ones from config
  shutdown(): Promise<void>;          // cancels all jobs (used at process exit)
}
```
Internally: convert each `WateringJobConfig` to a `node-schedule.RecurrenceRule` (`dayOfWeek: cfg.days.map(d => d % 7)` — node-schedule uses 0=Sun..6=Sat, ISO is 1=Mon..7=Sun, so this needs a tested mapping), instantiate `WateringJob`, keep handles for `.cancel()` on next `apply()`.

Delete the file-store code (`load`, `save`, `fromJSON`, `toJSON`, the `/wateringplans` constant). Delete [`RaspberryPi/serialization/serialized-watering-plan.ts`](../RaspberryPi/serialization/serialized-watering-plan.ts), [`serialized-watering-job.ts`](../RaspberryPi/serialization/serialized-watering-job.ts), [`serialized-recurrence-rule.ts`](../RaspberryPi/serialization/serialized-recurrence-rule.ts), [`serialized-relay.ts`](../RaspberryPi/serialization/serialized-relay.ts) — the new garden-config types replace them entirely.

Update `WateringJob.toJSON`/`fromJSON` references — those go away too. `WateringJob`'s constructor stays as-is.

**Update [`RaspberryPi/index.ts`](../RaspberryPi/index.ts):**

```ts
const relaysById = new Map(relays.map((r, i) => [i + 1, r]));  // 1..4
const wateringPlan = new WateringPlan(relaysById);
const configShadow = new ConfigShadow(awsConnection, (cfg) => wateringPlan.apply(cfg));
await configShadow.init();
```

The hardcoded morning plan disappears from `index.ts`; the default lives in [`garden-config.ts`](../RaspberryPi/serialization/garden-config.ts) (via `defaultGardenConfig`) and is only consulted on the very first boot of a new Pi.

`gracefulShutdown` adds `await wateringPlan.shutdown()` before `forceClose` on the relays.

**Tests:**
- Unit-test the day-of-week mapping (ISO 1..7 → node-schedule 0..6).
- Unit-test `WateringPlan.apply()` with a mock `WateringJob` factory: same config twice = no scheduled-job churn, different config = old cancelled, new scheduled. (Inject the factory via constructor.)
- ConfigShadow MQTT logic stays integration-tested (skip by default, same pattern as the existing shadow-relay integration test).

**Verification:**
- `npm test` green, coverage ≥ 95%.
- On a clean dev Pi (or MOCK_GPIO loopback): run, observe initial `update` publishing the default config, observe the two morning jobs schedule. Manually publish a desired-state update with a different schedule via the AWS IoT MQTT test client → observe Pi log "applying new config", jobs reschedule.

**At end of stage 2:** Pi behaves identically to today from the outside (same morning watering), but it now reads from the shadow. The app is unchanged and still works.

---

### Stage 3 — App subscribes to the config shadow + bed renaming ✅ Complete

The app starts reading bed names from the shadow.

**Post-merge fix (commit 4237f4b):** AWS IoT `update/delta` only carries the changed fields, never a full `GardenConfig`, so `parseGardenConfig` (Pi) and `GardenConfig.fromJson` (app) rejected every rename with an unsupported-schema-version error and bed renames silently failed to round-trip. Both sides now drive apply from `update/documents` (`current.state.desired`) with a `desired == previous.desired` skip to prevent the Pi's own `publishReported` from looping. Round-trip widget test added in [bed_rename_sheet_test.dart](../UI/garden_iot/test/widgets/bed_rename_sheet_test.dart). Adds a UI to rename them. Schedule editing comes in stage 4.

**New file — [`UI/garden_iot/lib/garden_config_model.dart`](../UI/garden_iot/lib/garden_config_model.dart):**

A `GardenConfigModel extends ChangeNotifier` that:
- Subscribes to `$aws/things/${deviceId}/shadow/name/config/{get,update}/{accepted,rejected}` via [`ShadowRelayModel`](../UI/garden_iot/lib/shadow_relay_model.dart)'s existing MQTT client (or its own — see refactor note below).
- On startup, publishes a `get` to load current state.
- Exposes:
  - `GardenConfig? get config` — null until first load.
  - `void renameBed(int relayId, String name)` — builds + publishes a desired update.
  - `Future<void> publishConfig(GardenConfig next)` — used by both renaming and (in stage 4) schedule editing.

Connection-state handling mirrors `ShadowRelayModel`'s pattern: surface disconnected via the same `_ConnectionBanner` already present in [`water_now_grid.dart`](../UI/garden_iot/lib/water_now_grid.dart).

**Refactor note:** [`ShadowRelayModel`](../UI/garden_iot/lib/shadow_relay_model.dart) currently owns the MQTT client. Two options:
- **(a)** Extract a thin `MqttGateway` provider that owns the client and a `topicStream(filter)` API; both `ShadowRelayModel` and `GardenConfigModel` consume it.
- **(b)** Give `GardenConfigModel` its own client.

Pick (a). One client = one connection charge + simpler reconnect story. The refactor is small (~40 lines in `shadow_relay_model.dart` move out; the relay model is reduced to subscribe/publish via the gateway).

**Wire it up in [`main.dart`](../UI/garden_iot/lib/main.dart):**

Add `MqttGateway` and `GardenConfigModel` to the `MultiProvider`. `mqttConnect` moves from `ShadowRelayModel` onto `MqttGateway` (kept at app root, same lifecycle).

**Replace static name lookup in [`env.dart`](../UI/garden_iot/lib/utils/env.dart):**

`AppConfig.relays` stays as a list of `RelayConfig`s but loses the `name` field — only `relayId` and `icon` (icons stay app-side because they're font codepoints, not user-editable strings). Add a helper that joins the static relay list with the dynamic config:

```dart
// in garden_config_model.dart
String bedName(int relayId) => config?.beds[relayId.toString()]?.name ?? 'Bed $relayId';
```

[`water_now_button.dart`](../UI/garden_iot/lib/water_now_button.dart) and [`dials_grid.dart`](../UI/garden_iot/lib/dials_grid.dart) (for the dial titles) consume this via `Consumer<GardenConfigModel>` and render `bedName(relayId)` instead of the static `relay.name` / `sensor.name`. (Sensors stay static for now — sensor IDs ≠ relay IDs and renaming sensors is out of scope; only the four relay-backed beds get renaming.)

**Bed-rename UI:**

Long-press a relay tile in the Water tab → bottom sheet with a `TextField` pre-filled with the current name + a "Save" button. Save calls `model.renameBed(relayId, newName)`.

Long-press is preferred to a dedicated edit screen — keeps the M3 affordances minimal and discoverable enough for a single-user app.

**Tests:**
- Widget tests for `WaterNowButton` updated to verify it renders the name from `GardenConfigModel` (mock the model).
- Widget test for the rename bottom sheet: enter text, tap save, mock model receives the update.
- Unit test for `GardenConfigModel` reducer: applying a delta updates `config`, notifies listeners.

**Verification:**
- `flutter analyze`, `flutter test` clean.
- Manual: launch the app against the dev Pi, rename a bed, observe the new name on both Home (dial title — if the sensor and relay share a name) and Water tabs; restart the app, name persists; second app instance receives the rename live.

**At end of stage 3:** Bed renaming works end-to-end. Schedule still effectively read-only from the app's perspective (the data is there but no editor exists).

---

### Stage 4 — App schedule editor ✅ Complete

The "Schedule" tab. CRUD on watering jobs.

**Add a new bottom nav destination in [`main.dart`](../UI/garden_iot/lib/main.dart):**

```
Sensors | Water | Schedule | Logs
```

(Four destinations is the M3 NavigationBar's sweet spot; five is still allowed.)

**New file — [`UI/garden_iot/lib/schedule_screen.dart`](../UI/garden_iot/lib/schedule_screen.dart):**

`Consumer<GardenConfigModel>` that renders:
- A list of `_JobTile`s, one per `config.jobs`, showing name, days as compact "M T W T F S S" with selected ones bold, time, duration, bed icons.
- Tap → opens `_JobEditorScreen` for that job.
- A FAB → opens `_JobEditorScreen` for a new job (with `newJobId()`).
- Swipe-to-delete with a confirmation `SnackBar` + undo (the M3 pattern), publishing the deletion only if undo isn't tapped.

**New file — [`UI/garden_iot/lib/schedule_editor.dart`](../UI/garden_iot/lib/schedule_editor.dart):**

A full-screen editor for a single `WateringJobConfig`:
- Name `TextField`.
- Day-of-week chips (`FilterChip`s for M/T/W/T/F/S/S), multi-select.
- Time picker (`showTimePicker`) → `hour`, `minute`.
- Duration: a `Slider` (1–30 min) and a `TextField` showing the value, kept in sync.
- Beds: `FilterChip`s for each relay using `bedName(relayId)` as the label.
- Save → `model.publishConfig(updatedConfig)` then `Navigator.pop()`.
- Cancel → just `pop()`.

Validation: name non-empty, at least one day selected, at least one bed selected, duration ≥ 1 min. Save button disabled until valid.

**Tests:**
- Widget test for `_JobEditorScreen`: prefilled with an existing job, edit each field, save publishes the right config delta.
- Widget test for swipe-to-delete + undo flow.
- Widget test for the days/beds chip selectors: tapping toggles, save reflects.

**Verification:**
- `flutter analyze`, `flutter test` clean; coverage ≥ 95%.
- Manual: edit the morning veg job to fire 30 minutes from now for 1 minute on a single relay. Watch the Pi logs: delta received, new job scheduled, fires on time, relay opens then closes after 1 min.

**At end of stage 4:** Full app-driven schedule editing.

---

### Stage 5 — Pi: structured log records with user / technical categories ✅ Complete

Today the Pi pipes everything through one [`mqttLogger`](../RaspberryPi/mqtt-logger.ts) stream (tslog → MQTT topic `${CLIENT_ID}/logging`). To support a split user/technical view in the app, every emitted record needs a `category` field, and the call sites that map to user-facing events need to opt into `user`.

**Shared types — [`RaspberryPi/serialization/log-record.ts`](../RaspberryPi/serialization/log-record.ts):**

```ts
export type LogCategory = 'user' | 'technical';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogRecord {
  device_id: string;       // CLIENT_ID
  timestamp: number;        // ms since epoch
  level: LogLevel;
  category: LogCategory;
  message: string;
  meta?: Record<string, unknown>;  // optional structured payload (e.g. {job_id, relays, duration_s})
}
```

A matching Dart class lands in [`UI/garden_iot/lib/serialization/log_record.dart`](../UI/garden_iot/lib/serialization/log_record.dart).

**Update [`RaspberryPi/mqtt-logger.ts`](../RaspberryPi/mqtt-logger.ts):**

The publish-to-MQTT side now emits a `LogRecord` JSON instead of a plain string. Add a sibling API for user-level events:

```ts
mqttLogger.userInfo('Watering job "Morning veg" completed', { job_id, relays, duration_s });
mqttLogger.userWarn('Pi offline');         // also fires from the LWT path on the broker side, but the Pi emits an explicit one on graceful shutdown
mqttLogger.userError('Watering job "Morning veg" failed: 2/2 relays did not open');
```

`userX` always sets `category: 'user'`. The existing `logger.info / warn / error / debug` continue to work but now stamp `category: 'technical'` automatically. No call site needs to think about category unless it wants to promote a message to user-level.

**Call sites to switch to `userX`** (everything else stays technical):

| File | Event |
|------|-------|
| [`watering-job.ts`](../RaspberryPi/watering-job.ts) `startWatering` | `userInfo('Watering "<job name>" starting', { duration_s, relays: [...] })` |
| [`watering-job.ts`](../RaspberryPi/watering-job.ts) `stopWatering` | `userInfo('Watering "<job name>" completed')` on clean stop; `userError(...)` if any close failed |
| [`watering-job.ts`](../RaspberryPi/watering-job.ts) `startWatering` failure branch | `userError('Watering "<job name>" failed: <n>/<total> relays did not open')` |
| [`index.ts`](../RaspberryPi/index.ts) main bootup | `userInfo('GardenIOT online')` after `publishOnline` |
| [`index.ts`](../RaspberryPi/index.ts) graceful shutdown | `userInfo('GardenIOT offline (graceful)')` |
| [`config-shadow.ts`](../RaspberryPi/config-shadow.ts) (new in stage 2) on `update/accepted` after applying a delta | `userInfo('Schedule updated', { job_count })` |

Note: `WateringJob` doesn't currently know its parent plan's job name. Stage 5 adds a `name?: string` to the `WateringJob` constructor, passed through from `WateringJobConfig.name`. Falls back to the job id if unnamed.

**Verification:**
- `npm test` green; coverage ≥ 95%.
- `MOCK_GPIO=1 npm run start:dev`, watch the MQTT log topic via `mosquitto_sub` / AWS IoT MQTT test client: every message is now a `LogRecord` JSON; user-level messages have `"category":"user"`.

**At end of stage 5:** Logs on the wire are structured and categorised. The app's existing logs tab still works (it parses `LogRecord.message` for display) but doesn't yet show the category split — that lands in stage 7.

---

### Stage 6 — AWS: persist log records to DynamoDB + paginated GET ✅ Complete

The MQTT log stream becomes durable + queryable. Adds one DynamoDB table, one IoT rule, one Lambda, one API route.

**[`AWS/cdk/lib/dynamodb-stack.ts`](../AWS/cdk/lib/dynamodb-stack.ts):**

```ts
this.logTable = new dynamodb.Table(this, 'GardenLogTable', {
  partitionKey: { name: 'pk',        type: dynamodb.AttributeType.STRING }, // `${device_id}#${category}`
  sortKey:      { name: 'timestamp', type: dynamodb.AttributeType.NUMBER },
  timeToLiveAttribute: 'ttl',  // unix seconds; set to timestamp_seconds + 90 days at write time
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: RemovalPolicy.DESTROY,
});
```

Composite partition key (`device_id#category`) means a single `Query` against one partition with `ScanIndexForward: false, Limit: 50` is all you need for the most-recent-first list, paginated by an opaque `LastEvaluatedKey`. No GSI required. 90-day TTL keeps the table from growing forever; user can revisit if they want longer retention.

**[`AWS/cdk/lib/iot-stack.ts`](../AWS/cdk/lib/iot-stack.ts):**

Keep the existing `LoggingTopicRule` writing to CloudWatch (handy debug backstop with its 2-year retention). Add a second rule writing the same topic to DynamoDB:

```ts
new iot_alpha.TopicRule(this, 'LoggingDynamoRule', {
  topicRuleName: 'LoggingDynamoRule',
  sql: iot_alpha.IotSql.fromStringAsVer20160323(
    `SELECT *,
            concat(device_id, '#', category) AS pk,
            (floor(timestamp / 1000) + 7776000) AS ttl
       FROM '${loggingTopic}'`
  ),
  actions: [new actions.DynamoDBv2PutItemAction(props.logTable)],
});
```

The IoT rule's `DynamoDBv2PutItemAction` writes the SELECT result as one DynamoDB item per message. The Pi already sends `device_id`, `timestamp`, `level`, `category`, `message`, `meta` — the rule adds `pk` (composite) and `ttl`.

**New Lambda — [`AWS/lambda-code/src/logs_get.ts`](../AWS/lambda-code/src/logs_get.ts):**

```
GET /logs?category=user&before=<ms>&limit=50
```

Query the partition `${device_id}#${category}` with `KeyConditionExpression: 'pk = :pk AND #ts < :before'`, `ScanIndexForward: false`, `Limit: <limit>`. Default `category=user`, `limit=50`, `before=now`. `device_id` is read from `process.env.GARDEN_DEVICE_ID` (single Pi for now).

Response:
```json
{
  "logs": [{ "timestamp": 1716480000000, "level": "info", "category": "user", "message": "...", "meta": {...} }, ...],
  "nextBefore": 1716479800000  // pass as ?before on the next page; null when no more
}
```

Validation: `category` must be `user` or `technical`; `limit` clamped 1–200; `before` defaults to `Date.now()`.

**[`AWS/cdk/lib/lambda-stack.ts`](../AWS/cdk/lib/lambda-stack.ts):**

Add `logsGetLambda` via the existing `makeFunction` helper. Plumb `GARDEN_DEVICE_ID` and `GARDEN_LOG_TABLE` env vars. Grant `props.logTable.grantReadData(logsGetLambda)`. Add `GET /logs` to the API Gateway (no API key — read-only, same model as `GET /temperature`).

Bump `apiGatewayDeployment.addToLogicalId({ methods: [...] })` to include `GET /logs` so the stage actually picks up the new method.

**Tests:**
- Lambda unit tests for `logs_get`: bad category → 400, default category, pagination via `before`, response shape.
- CDK snapshot test regenerated (one new table, one new rule, one new Lambda, one new API method).

**Verification:**
- `npm test` (Lambda, CDK) green.
- Manual: deploy, restart Pi (it emits `GardenIOT online` as a user-level event), `curl https://api.${customDomainName}/${ver}/logs?category=user` returns the new record.

**At end of stage 6:** Every log message is persisted to DynamoDB for 90 days. A paginated GET endpoint serves them, partitioned by category, in reverse-chrono order.

---

### Stage 7 — App: dual-stream logs UI with infinite scroll ⏳ Next up

The Logs tab gets a category toggle and an infinite scroll backed by the new GET endpoint, with live tail from MQTT on top.

**Update [`UI/garden_iot/lib/log_model.dart`](../UI/garden_iot/lib/log_model.dart):**

Two split streams instead of one bag of strings:

```dart
class LogModel extends ChangeNotifier {
  // Live tail from MQTT (most-recent-first, capped per-category to avoid unbounded growth on long sessions).
  Queue<LogRecord> liveUser = Queue();
  Queue<LogRecord> liveTechnical = Queue();

  // Lazy-loaded history from the GET endpoint, appended below the live tail. Keyed by category.
  List<LogRecord> historyUser = [];
  List<LogRecord> historyTechnical = [];
  bool isLoadingMoreUser = false;
  bool isLoadingMoreTechnical = false;
  bool hasMoreUser = true;
  bool hasMoreTechnical = true;
  int? _oldestSeenUserTs;     // for the next `before` cursor
  int? _oldestSeenTechnicalTs;

  Future<void> loadMore(LogCategory cat) async { ... }
  void ingestLive(LogRecord rec) { ... }  // called from the MQTT subscription
}
```

Live cap stays small (say 200 each) so the in-memory list doesn't grow without bound on long sessions. Anything older than the cap is dropped from `live*`; the history loaded via HTTP fills that role from a certain point downward.

De-duplication on the boundary: when the user scrolls into history, the first HTTP page may overlap with the oldest live records. Dedupe by `(device_id, timestamp, message)` — collisions on that tuple are vanishingly unlikely at this volume.

**Update [`UI/garden_iot/lib/logger.dart`](../UI/garden_iot/lib/logger.dart):**

Replace the single `ListView.separated` with:

```
┌──────────────────────────────────────────┐
│  [ User ▒ ][ Technical  ]                │  ← SegmentedButton
├──────────────────────────────────────────┤
│  08:05  Morning veg completed            │
│  08:00  Morning veg starting (5 min)     │  ← live tail (no spinner)
│  ────────────────────────────────────    │
│  (yesterday) 08:05  Morning veg done     │  ← history
│  (yesterday) 08:00  Morning veg start    │
│  ...                                     │
│  ⟳ Loading older entries...               │  ← shown when isLoadingMoreX && hasMoreX
└──────────────────────────────────────────┘
```

- `SegmentedButton<LogCategory>` at the top swaps between User and Technical.
- Reverse-chronological list (newest at top, scroll down = older).
- Use a `ScrollController` with a listener that calls `model.loadMore(currentCat)` when the user is within ~200 px of the bottom AND `hasMore && !isLoadingMore`.
- Bottom widget: spinner if loading, "No more entries" if `!hasMore`, nothing otherwise.
- Live tail auto-scrolls back to the top on new entries **only when the user is at the top** (don't yank them away from history they're reading). Standard chat-app pattern.

User-tier rendering: hide level icons, just show `HH:mm` + message — minimal noise for the casual "did watering happen" view.
Technical-tier rendering: show `level` (color-coded badge), full timestamp (date + ms), and a tappable expand to show `meta` JSON.

**Wire the HTTP fetch:**

Add a small `LogsApi` client class in [`UI/garden_iot/lib/utils/logs_api.dart`](../UI/garden_iot/lib/utils/logs_api.dart) that calls `GET /logs` with `category`, `before`, `limit`. Route the host through `AppConfig.temperatureApiHost` (same custom domain). Reuse [`TemperatureModel`](../UI/garden_iot/lib/temperature_model.dart)'s `http.Client` injection pattern so tests can mock it.

**Tests:**
- `LogModel` unit tests: ingest live records partitions into the right queue; `loadMore` paginates via the mock API; dedup on the live/history boundary.
- Widget tests for the new `LoggerView`: switching segments calls `loadMore` for the new category only on first switch; scroll-to-bottom triggers `loadMore`; live-tail message ingestion appears at top.
- Update existing [`test/widgets/logger_view_test.dart`](../UI/garden_iot/test/widgets/logger_view_test.dart) for the new layout.

**Verification:**
- `flutter analyze`, `flutter test` green; coverage ≥ 95%.
- Manual: launch app, segment on "User"; force a watering job to fire (edit it to 1 min from now); see the start/complete pair appear live at top. Switch to "Technical", see the full MQTT/relay debug stream. Scroll down on either segment, see older entries lazy-load until the 90-day TTL horizon.

**At end of stage 7:** All three logging asks delivered (persistence, dual stream, infinite scroll).

---

### Stage 8 — Cleanup, CI sanity, docs

- **IoT policy check.** [`iot-stack.ts`](../AWS/cdk/lib/iot-stack.ts) already wildcards shadow topics with `name/*`, so no CDK change is required for the `config` shadow. Re-read it once and confirm; if I'm wrong, add explicit `name/config/*` ARNs to both Device and MobileApp policies.
- **CDK snapshot test.** Regenerate (`AWS/cdk/__tests__/__snapshots__/`) — stage 6 adds a table + IoT rule + Lambda + API method so the snapshot will change regardless.
- **Delete dead code on the Pi:** any lingering references to the file-store API (now-deleted `/wateringplans` constant, old serialization files, `fs/promises` import) caught at this stage.
- **Update READMEs:**
  - [`RaspberryPi/README.md`](../RaspberryPi/README.md): add the `config` shadow to the "MQTT topics" table; remove the line about the half-built file store; document the structured `LogRecord` shape on the logging topic and the user/technical category convention.
  - [`UI/garden_iot/README.md`](../UI/garden_iot/README.md): one sentence on the new Schedule tab, bed renaming, and the dual-stream Logs tab.
  - [`AWS/lambda-code/README.md`](../AWS/lambda-code/README.md) / [`AWS/cdk/README.md`](../AWS/cdk/README.md): note the new `GardenLogTable`, the `LoggingDynamoRule` IoT rule, and the `GET /logs` Lambda + endpoint.
- **Update [`CLAUDE.md`](../CLAUDE.md):** brief mention that bed names + watering schedule live in the `config` shadow; that all log messages are structured `LogRecord` JSON tagged with `category: user|technical` and persisted to `GardenLogTable` for 90 days; with links to the doc shapes.

**Verification:** all four CI jobs green; coverage thresholds met on Pi, Lambda, CDK, Flutter.

## Out of scope (explicit non-goals)

- **Per-user auth.** Both the Pi and the app still authenticate with a shared device-style cert. A user who installs the app gets full edit access. Real auth (Cognito identity, per-user policies) stays the larger workstream documented in [`iot-stack.ts:46`](../AWS/cdk/lib/iot-stack.ts#L46).
- **Sensor renaming.** Sensors are not relay-backed; renaming them needs a separate doc/shadow or a generalisation of the config schema. Out of scope here.
- **Multi-garden / multi-Pi.** Schema assumes one `config` shadow on one Thing. Adding a second garden would need a per-garden config key.
- **Calendar / one-off jobs.** "Water on the 3rd of June" isn't supported by the weekly model. If the user later wants this, bump `version: 2` and add an optional `date` field.
- **Historical schedule changes.** The shadow keeps the *current* config only — no audit log of who changed what when. (User-visible schedule changes do generate a `Schedule updated` user-level log line, which gives a rough audit trail via the Logs tab.)
- **Schedule preview / next-fire times.** A "next watering in 3h 12m" indicator would be nice but isn't critical.
- **Full-text log search.** The Logs tab paginates by time only — no `?q=...`. Add later if 90 days of categorised, time-ordered scrolling proves insufficient.
- **Log export.** No CSV/JSON download button on the app. CloudWatch's `Status` log group still has 2-year retention as the deeper-history backstop for the rare debug session.
- **Per-job result records.** Watering completions are logged as plain user-level lines, not as queryable structured records. A future "show me the last 30 days of Morning veg's runs" view would want a dedicated table; out of scope here.

## Files at a glance

**Stage 1 — Added:**
- `RaspberryPi/serialization/garden-config.ts`
- `UI/garden_iot/lib/serialization/garden_config.dart`

**Stage 2 — Added:**
- `RaspberryPi/config-shadow.ts`

**Stage 2 — Modified:**
- `RaspberryPi/watering-plan.ts` (rewritten)
- `RaspberryPi/index.ts` (hardcoded plan removed; ConfigShadow wired in)

**Stage 2 — Deleted:**
- `RaspberryPi/serialization/serialized-watering-plan.ts`
- `RaspberryPi/serialization/serialized-watering-job.ts`
- `RaspberryPi/serialization/serialized-recurrence-rule.ts`
- `RaspberryPi/serialization/serialized-relay.ts`

**Stage 3 — Added:**
- `UI/garden_iot/lib/garden_config_model.dart`
- `UI/garden_iot/lib/mqtt_gateway.dart` (extracted from ShadowRelayModel)
- `UI/garden_iot/lib/bed_rename_sheet.dart`

**Stage 3 — Modified:**
- `UI/garden_iot/lib/shadow_relay_model.dart` (uses MqttGateway)
- `UI/garden_iot/lib/main.dart` (new providers)
- `UI/garden_iot/lib/utils/env.dart` (drop hardcoded names; keep ids + icons)
- `UI/garden_iot/lib/water_now_button.dart` (name from model)
- `UI/garden_iot/lib/dials_grid.dart` / sensor labels (name from model where relay-backed)

**Stage 4 — Added:**
- `UI/garden_iot/lib/schedule_screen.dart`
- `UI/garden_iot/lib/schedule_editor.dart`

**Stage 4 — Modified:**
- `UI/garden_iot/lib/main.dart` (add Schedule destination)

**Stage 5 — Added:**
- `RaspberryPi/serialization/log-record.ts`
- `UI/garden_iot/lib/serialization/log_record.dart`

**Stage 5 — Modified:**
- `RaspberryPi/mqtt-logger.ts` (structured `LogRecord` payloads + `userX` API)
- `RaspberryPi/watering-job.ts` (accept job name; emit user-level start/complete/failure)
- `RaspberryPi/index.ts` (user-level online/offline)
- `RaspberryPi/config-shadow.ts` (user-level `Schedule updated` — added in stage 2 but call site added here)

**Stage 6 — Added:**
- `AWS/lambda-code/src/logs_get.ts`

**Stage 6 — Modified:**
- `AWS/cdk/lib/dynamodb-stack.ts` (new `GardenLogTable`)
- `AWS/cdk/lib/iot-stack.ts` (new `LoggingDynamoRule`)
- `AWS/cdk/lib/lambda-stack.ts` (new `logsGetLambda` + `GET /logs` route + deployment hash bump)

**Stage 7 — Added:**
- `UI/garden_iot/lib/utils/logs_api.dart`

**Stage 7 — Modified:**
- `UI/garden_iot/lib/log_model.dart` (dual-stream live + lazy history per category)
- `UI/garden_iot/lib/logger.dart` (segmented control, infinite scroll, dedup)
- `UI/garden_iot/test/widgets/logger_view_test.dart` (rewritten for new layout)

**Stage 8 — Modified (docs only):**
- `RaspberryPi/README.md`
- `UI/garden_iot/README.md`
- `AWS/lambda-code/README.md`
- `AWS/cdk/README.md`
- `CLAUDE.md`

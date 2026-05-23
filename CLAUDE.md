# GardenIOT — agent guide

Notes for Claude / agents working in this repo. Covers things that aren't
obvious from `ls`, the per-component READMEs, or `git log`.

## Components

```
RaspberryPi/       Node app on the Pi. GPIO relays + AWS IoT Thing Shadow sync.
AWS/cdk/           CDK app: IoT thing/policy/cert, Lambda + API Gateway, DynamoDB.
AWS/lambda-code/   Lambda handlers (temperature GET, sensor data ingest).
UI/garden_iot/     Flutter app (Android + iOS): dials, water-now buttons, log viewer.
.github/workflows/ pi-test, lambda-test, cdk-test, flutter-test, dependabot-automerge.
```

Each component has its own README — read it before touching that component.

## Build & test

| Component | Install | Test | Coverage |
|-----------|---------|------|----------|
| Pi | `cd RaspberryPi && npm ci --ignore-scripts` | `npm test` | `npm run test:coverage` |
| Lambda | `cd AWS/lambda-code && npm ci` | `npm test` | `npm run test:coverage` |
| CDK | `cd AWS/cdk && npm ci` | `npm test` | `npm run test:coverage` |
| Flutter | `cd UI/garden_iot && flutter pub get` | `flutter test` | `flutter test --coverage` |

Pi uses `--ignore-scripts` because `rpi-gpio` builds a native epoll binding
that only compiles on a real Pi. Tests use `MOCK_GPIO=1`.

All three Node projects use **vitest 3.x** with a **95% coverage threshold
enforced via `vitest.config.ts`** (lines + statements; branches lower on Pi
because of unreachable defensive paths). Flutter enforces 95% via
[UI/garden_iot/tool/check_coverage.py](UI/garden_iot/tool/check_coverage.py),
which excludes `shadow_relay_model.dart` (covered by an integration test
that needs a live MQTT broker).

## CI and Dependabot auto-merge

Branch protection on `main` requires all four status checks to pass:
`pi-test`, `lambda-test`, `cdk-test`, `flutter-test`. Strict (PR must be
up-to-date with main). Admins not enforced — the owner can still push
directly to main when needed.

Each test workflow's **job ID matches the workflow name**
(e.g. `jobs.pi-test` in `pi-test.yml`) so the four required checks have
distinct names. Don't rename them without updating the branch protection
contexts via the GitHub API.

`pull_request` triggers have **no path filters** — every PR runs all four
test workflows. A required check that skips (because of a path filter)
would block the merge forever. `push` triggers keep path filters so doc
commits to main don't burn CI for nothing.

Dependabot PRs auto-merge via
[.github/workflows/dependabot-automerge.yml](.github/workflows/dependabot-automerge.yml):
it runs on `pull_request_target` (base-branch context, has secrets) but
only calls `gh pr merge --auto --squash --delete-branch` — no PR code is
checked out or executed. The actual safety gate is the four required
checks. Repo settings have `allow_auto_merge=true` and
`delete_branch_on_merge=true`.

## Quirks you will hit

**CDK tests need a stub Lambda asset.** `LambdaStack` calls
`lambda.Code.fromAsset("../lambda-code/dist/lambda.zip")`, so `cdk synth`
(and therefore the snapshot tests) fails if that file doesn't exist. The
CI workflow creates a stub; if you're running tests locally for the first
time, run `cd AWS/lambda-code && npm run build` first or create an empty
zip yourself.

**Flutter tests need stub cert files.** `flutter test --coverage` builds
the asset bundle, which fails without the prod cert/key files in
`assets/certs/` (gitignored). CI creates empty placeholders before
testing; do the same locally if you haven't deployed real ones.

**Pi `uuid` override is API-safe but documented.** `package.json` overrides
`uuid` to `^11.1.1` to silence a transitive advisory.
`aws-iot-device-sdk-v2` only calls `uuid.v4()`, whose signature is stable
across 8→11. See the `//overrides-rationale` key for details. **Don't add
a blanket `brace-expansion` override** — it breaks `minimatch@9.0.9`
nested under glob, which expects the 2.x default-export API. The CDK
project has a long note on this in its `package.json`; the bundled
aws-cdk-lib copy is the only stuck instance and is dismissed in
Dependabot as `tolerable_risk` (alert #146).

**Each Node project has both a `__tests__/` directory and `tsconfig.json`
excludes for it.** Tests are compiled by vitest, not tsc. Don't add tests
to a path tsc actually compiles or you'll get duplicate output.

## Operational notes (Pi)

The Pi runs the app under a dedicated `pm2` user, not the operator
account. Deploy uses a pull model via systemd timer.

**Always use `sudo -iu pm2` (or `-Hu`)** when running anything as the pm2
user. Plain `sudo -u pm2 pm2 list` inherits the caller's `HOME`, which
spawns a *second* pm2 daemon under the wrong directory and causes
silent MQTT_NOT_CONNECTED failures on the next deploy. [bootstrap.sh](RaspberryPi/bootstrap.sh)
exports `PM2_HOME` in the pm2 user's `.bashrc`/`.profile`/`.bash_profile`
and adds a sudoers `env_keep` for `PM2_HOME` as a belt-and-braces defence.

See [RaspberryPi/README.md](RaspberryPi/README.md) "Talking to pm2 from
the operator account" for the three safe invocation patterns.

[deploy.sh](RaspberryPi/deploy.sh) is what the systemd timer fires; it's
also fine to run manually. It pulls, builds, copies to `/opt/gardeniot/`,
and `pm2 reload`s.

## Security posture

AWS IoT private keys live in:
- `RaspberryPi/.env` (gitignored, deployed manually)
- `UI/garden_iot/assets/certs/` (gitignored, **shipped inside the app
  bundle** — a known limitation; reworking to per-user Cognito identity
  is out of scope for now)

Both are referenced in `.gitignore` (`**/assets/certs/*`, `.env`). Don't
commit them. Test runs use empty stubs.


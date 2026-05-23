# Refactor & redesign the GardenIOT Flutter app

## Context

The Flutter app at [UI/garden_iot/](UI/garden_iot/) is the user's first Flutter project. It has three problems being fixed in one pass:

1. **Dead code** — a non-functional "Add new sensor" button on the Home tab sits on top of a ~5-file chain of partially-implemented support code (editor dialog, type dropdown, number picker, long-press-to-delete wrapper, JSON persistence).
2. **Weak visual design** — no `ThemeData` is set at all. The app gets Flutter's default Material 2 look; hardcoded `Colors.red`/`amber`/`green`/`black`/`white`, inline `TextStyle`s, no dark mode, no `ColorScheme`.
3. **First-Flutter-project code smells, plus real bugs** — `LogModel`'s mutex is broken (acquire-without-release → deadlock after the first listener add); `TemperatureModel` builds a malformed query string (`?sensor_id1&sensor_id2&` with no `=value`); `ShadowRelayModel.unsubscribe` uses `_clientId` where subscribe uses `_deviceId`; `WaterNowGrid` fires an unawaited async IIFE in `initState` that never calls `setState`; `dial_attributes.json` persistence has a load bug that silently drops state; `Dart 2.12` pin excludes Dart 3 entirely; `ndialog`/`mockito`/`build_runner` declared but never used.

User direction:
- **Scope**: everything in one cohesive refactor (dead code + visual + bugs + idioms).
- **SDK**: bump to Dart 3 + update transitively-stale deps (`http` 0.13→1.x, `mqtt_client` 9→10, `syncfusion_flutter_gauges` 20→24+).
- **Visual direction**: Material 3, garden-green palette via `ColorScheme.fromSeed`, light + dark mode, replace the dated syncfusion gauge with a themed custom gauge.

Outcome: a noticeably nicer-looking app that no longer has dead "Add new sensor" affordance, with the existing correctness bugs fixed and the codebase using idiomatic Flutter patterns (`ChangeNotifier`+`provider` consistently, `const` constructors, `Theme.of(context)` for colours/text, M3 components).

## Approach — five phases, delivered as one branch

Phases are an implementation order, not separate PRs. Each phase leaves the app buildable.

### Phase A — Foundations (pubspec, theme, root)

[UI/garden_iot/pubspec.yaml](UI/garden_iot/pubspec.yaml):
- Bump `environment.sdk` to `>=3.0.0 <4.0.0`.
- Drop unused: `ndialog`, `build_runner` (runtime), `mockito` (dev — no mocks generated), `numberpicker`, `path_provider` (both die with the dead-code chain).
- Bump: `http: ^1.2.0`, `mqtt_client: ^10.0.0`, `syncfusion_flutter_gauges: ^24.0.0` (only if we end up keeping it — see Phase D), `provider: ^6.1.0`.
- Add dev: `flutter_lints: ^4.0.0`.

New file [UI/garden_iot/lib/theme/app_theme.dart](UI/garden_iot/lib/theme/app_theme.dart):
- `static const seedColor = Color(0xFF2E7D32)` — leafy green.
- `static ThemeData light()` / `static ThemeData dark()` using `ColorScheme.fromSeed(seedColor: ..., brightness: ...)`, `useMaterial3: true`, `cardTheme`, `appBarTheme`, `textTheme` overrides for the few semantic styles we use (`headlineSmall` for dial titles, `bodyMedium` for log lines via a `monospace` font family).
- A small `AppSpacing` const class (`xs/sm/md/lg = 4/8/16/24`) and `AppRadii` to replace ad-hoc literals.

[UI/garden_iot/lib/main.dart](UI/garden_iot/lib/main.dart) rewrite:
- `MyApp` becomes a `const` `StatelessWidget` with `super.key`; remove the held `_dialsGrid` / `_logger` instance fields.
- `MaterialApp` gains `theme: AppTheme.light()`, `darkTheme: AppTheme.dark()`, `themeMode: ThemeMode.system`, `debugShowCheckedModeBanner: false`, `title`.
- Tabs get text labels alongside icons.
- Construct tab widgets inline in `TabBarView` (they're cheap; `const` where possible).
- Move MQTT connection lifecycle off the Water tab — see Phase D note on `ShadowRelayModel`.

### Phase B — Dead-code removal

Delete entirely:
- [UI/garden_iot/lib/new_dial_button.dart](UI/garden_iot/lib/new_dial_button.dart)
- [UI/garden_iot/lib/dial_editor.dart](UI/garden_iot/lib/dial_editor.dart)
- [UI/garden_iot/lib/dial_type_dropdown.dart](UI/garden_iot/lib/dial_type_dropdown.dart)
- [UI/garden_iot/lib/sensor_id_picker.dart](UI/garden_iot/lib/sensor_id_picker.dart)
- [UI/garden_iot/lib/dial_grid_tile.dart](UI/garden_iot/lib/dial_grid_tile.dart)
- [UI/garden_iot/lib/serialization/serialization_exception.dart](UI/garden_iot/lib/serialization/serialization_exception.dart) (unreferenced)
- [UI/garden_iot/test/widget_test.dart](UI/garden_iot/test/widget_test.dart) (stock counter test, never adapted)

Simplify [UI/garden_iot/lib/dials_grid.dart](UI/garden_iot/lib/dials_grid.dart):
- Drop `_loadFromPersistentStorage`, `_saveToPersistentStorage`, `_localFilePath`, `_initState`, `_removeDial`, `_addNewDial`, `_createNewDialGridTile`, the `_dials` mutable list, the `dialsPlusAddButton` aggregation, the `dialsFilename` constant.
- Drop `dart:io`, `path_provider`, `dart:convert` imports.
- Becomes a `const StatelessWidget` that renders a fixed `GridView` of `TemperatureDial`s defined in config (see Phase C — sensor list moves to `Env`/config).

User-data note: existing users may have a `dial_attributes.json` in app docs dir. After this change it's an orphaned file that's never read; no migration needed.

### Phase C — Model layer fixes

[UI/garden_iot/lib/utils/env.dart](UI/garden_iot/lib/utils/env.dart):
- Replace `bool.fromEnvironment('dart.vm.product')` with `kReleaseMode` from `package:flutter/foundation.dart`.
- Convert from all-static `Env` class to a top-level `final AppConfig config = ...` object, or keep `Env` but add proper return types.
- Route the temperature HTTP base URL through here (currently hardcoded in `TemperatureModel`).
- Add `List<SensorConfig> sensors` (name + sensorId + temperature ranges) to drive the home grid. Add `List<RelayConfig> relays` (name + relayId) to drive the water grid — kills the "TODO get this from config somewhere" comment and the hardcoded "Greenhouse"/"Flowers"/etc. strings in `WaterNowGrid`.

[UI/garden_iot/lib/log_model.dart](UI/garden_iot/lib/log_model.dart) — rewrite (~30 lines):
- Drop the broken `Mutex` (was deadlocking after the first listener add) and the bespoke `LogListener` abstract class.
- Replace with `StreamController<List<String>>.broadcast()` exposing a stream of the current buffer; keep a `Queue<String>` ring buffer capped at 50 with correct `>=` boundary.
- Replace `getLogMessages()` with a `messages` getter returning an unmodifiable view.
- Drop the `print('Constructing the one and only LogModel')`.

[UI/garden_iot/lib/logger.dart](UI/garden_iot/lib/logger.dart) — rewrite (~40 lines):
- Replace the bespoke `LogListener` mixin with a `StreamBuilder<List<String>>`.
- Use `Theme.of(context).textTheme.bodySmall` with a monospace family declared in pubspec fonts (or stop pretending to be Courier and use the default).
- Auto-scroll to bottom on new lines via a `ScrollController`.

[UI/garden_iot/lib/shadow_relay_model.dart](UI/garden_iot/lib/shadow_relay_model.dart) — substantial refactor:
- Make it `extends ChangeNotifier`; expose per-relay state via a `Map<int, RelayState>` and a `notifyListeners()` instead of the manual `_relayStateListeners` / `_onConnectedCallbacks` lists.
- **Fix the unsubscribe bug**: line ~72 uses `_clientId` where line ~44 (subscribe) uses `_deviceId`; align both.
- **Fix the race-condition `Future.delayed(500ms)` hack**: use `mqtt_client` 10's subscription-confirmation callback (`onSubscribed`) and chain the initial `get` publish off that.
- **Remove the global `SecurityContext.defaultContext` mutation**: create a local `SecurityContext` per connection.
- Move connection lifecycle out: the model is constructed at app root in `main.dart`'s `MultiProvider`, so `mqttConnect` should be called once on app start and `mqttDisconnect` on app teardown — not in `WaterNowGrid.initState`/`dispose` (which currently churns the connection on every tab switch).
- Drop the commented-out `_onLogging` branch (and the dead subscription to `_deviceLoggingTopic` if nothing else consumes it).
- Defensive-copy the listener iteration sites that remain.
- Replace the `print(...)` calls in `_onGetStateMessage` with `_logModel.log(...)`.

[UI/garden_iot/lib/temperature_model.dart](UI/garden_iot/lib/temperature_model.dart) — refactor:
- **Fix the URI**: build with `Uri.https(host, path, {'sensor_id': sensorIds.join(',')})` (or whatever the API actually expects — needs a quick check against the lambda code in [AWS/lambda-code/src/temperature_get.ts](AWS/lambda-code/src/temperature_get.ts) before settling on the param shape).
- Route the host through `Env`/`AppConfig`.
- Replace `SensorIdToTemperatureReading` wrapper with `Map<int, TemperatureReading>` directly.
- Dedupe sensor ids in `addSensor` (`Set<int>`).
- Wrap `_getTemperature` in try/catch; log failures to `LogModel` instead of `print` + throw.
- Drop the `new` keywords; replace `Timer.periodic` with a cancellable timer stored in a field, and override `dispose()` to cancel it.
- `_sensorIds`/`addSensor`/`removeSensor` can probably be removed entirely once the home grid is driven by `Env.sensors` — the model just polls the configured list directly.

[UI/garden_iot/lib/serialization/](UI/garden_iot/lib/serialization/) — collapse 5 files → 1:
- New [UI/garden_iot/lib/serialization/shadow_message.dart](UI/garden_iot/lib/serialization/shadow_message.dart): one `enum RelayState { open, closed }` with a `fromJsonString` factory, one `ShadowMessage` class with `reported` and `desired` getters returning `RelayState?`.
- Delete `open_closed.dart`, `reported.dart`, `reported_state.dart`, `desired.dart`, `desired_state.dart`.
- Update [UI/garden_iot/test/serialization_test.dart](UI/garden_iot/test/serialization_test.dart) to round-trip the new collapsed model.

### Phase D — Screen rebuild (visual redesign)

[UI/garden_iot/lib/temperature_dial.dart](UI/garden_iot/lib/temperature_dial.dart):
- Replace `Provider.of` + `context.watch` mix with a single `Consumer<TemperatureModel>`.
- Replace hardcoded `Colors.red`/`amber`/`green` and fixed -10–50 range with `SensorConfig`-driven ranges and `ColorScheme`-derived colours (`colorScheme.error` / `colorScheme.tertiary` / `colorScheme.primary`).
- **Decision point on syncfusion**: simplest path is to keep `syncfusion_flutter_gauges` 24+ and theme its bands via the new `ColorScheme`. Replacing it with a custom `CustomPainter` gauge is more work and risk; not worth it unless the bumped syncfusion still looks dated after theming. **Plan recommends: keep + theme; revisit if the visual result is unsatisfying after Phase D is complete.**
- Wrap in a themed `Card` with elevation + rounded corners (matches M3 default).
- Fix `temperatureReading == null ? 0.00 : temperatureReading.temperature` → `temperatureReading?.temperature ?? 0`.

[UI/garden_iot/lib/water_now_grid.dart](UI/garden_iot/lib/water_now_grid.dart) + [UI/garden_iot/lib/water_now_button.dart](UI/garden_iot/lib/water_now_button.dart) — rebuild:
- Drop the async IIFE in `initState`; drop the `mqttConnect`/`mqttDisconnect` calls (now lifecycled at app root — see Phase C `ShadowRelayModel`).
- `WaterNowGrid` becomes a `Consumer<ShadowRelayModel>` that renders a grid of `WaterNowButton`s built from `Env.relays`.
- `WaterNowButton` becomes a themed `Card` containing a `Switch.adaptive` with an icon + label, reading state via `model.relayStateFor(relayId)` and calling `model.setDesiredState(relayId, ...)` on toggle.
- Connection error UI: if `model.connectionState == disconnected`, show a `SnackBar` with a Retry action rather than a forever spinner.

[UI/garden_iot/lib/dials_grid.dart](UI/garden_iot/lib/dials_grid.dart):
- Responsive `GridView.builder` driven by `Env.sensors`; `crossAxisCount` derived from `MediaQuery` width (1 col < 360px, 2 col < 720px, 3 col otherwise).
- Each dial in a `Card`.

App bar / scaffolding ([UI/garden_iot/lib/main.dart](UI/garden_iot/lib/main.dart)):
- Use M3 `NavigationBar` at the bottom instead of `TabBar` at the top — feels more modern on mobile and gives more vertical space for content. (Keeps the same 3-destination layout: Home / Water / Logs.)
- Drop the `(envName)` suffix from the title; show env as a small chip in the AppBar instead so prod and dev are visually distinct without crowding the title.

### Phase E — Lint, tests, verification

[UI/garden_iot/analysis_options.yaml](UI/garden_iot/analysis_options.yaml) — new file:
- `include: package:flutter_lints/flutter.yaml`
- Enable `unnecessary_new`, `prefer_const_constructors`, `prefer_const_literals_to_create_immutables`, `avoid_print`, `unawaited_futures`.

Tests:
- Delete [UI/garden_iot/test/widget_test.dart](UI/garden_iot/test/widget_test.dart).
- Move [UI/garden_iot/test/shadow_relay_model_test.dart](UI/garden_iot/test/shadow_relay_model_test.dart) → `test/integration/shadow_relay_model_test.dart` and mark `skip: 'integration — requires live MQTT endpoint'` by default.
- Update [UI/garden_iot/test/serialization_test.dart](UI/garden_iot/test/serialization_test.dart) for the collapsed `ShadowMessage` + `RelayState` model.

## Verification

Run in order; each step should pass cleanly before moving on.

```bash
cd UI/garden_iot
flutter clean
flutter pub get          # confirms pubspec resolves on Dart 3 + bumped deps
flutter analyze          # must be clean — no warnings, no infos
flutter test             # serialization_test.dart should pass
```

Then run the app on a device or emulator and manually exercise:

1. **Home tab**: 3 temperature dials populate with current readings (or `0` if HTTP fails — log line should appear in the Logs tab, no exception); colours match the green theme, not the old red/amber/green hardcoded bands. No "Add new sensor" button.
2. **Water tab**: switches accurately reflect each relay's current shadow state on first open (no infinite spinner); toggling a switch publishes a desired-state update and the switch settles on the reported state within ~1s; disconnecting wifi → SnackBar with Retry appears; reconnecting → switches resume working without restarting the app.
3. **Logs tab**: log lines stream in for connect/disconnect/MQTT events; the buffer caps at 50; the tab auto-scrolls to the bottom on new entries.
4. **Tab switching**: navigating Home → Water → Logs → Water does **not** churn the MQTT connection (verify by watching `LogModel` — no `Disconnected` / `Connected` lines on tab switch).
5. **Dark mode**: toggle system dark mode (Android: Settings → Display → Dark theme; iOS: Settings → Display & Brightness); UI swaps to a dark green-themed palette without losing legibility.
6. **Orientation**: rotate to landscape; dial grid reflows from 2 cols → 3 cols.

## Files changed

Modified:
- [UI/garden_iot/pubspec.yaml](UI/garden_iot/pubspec.yaml)
- [UI/garden_iot/lib/main.dart](UI/garden_iot/lib/main.dart)
- [UI/garden_iot/lib/dials_grid.dart](UI/garden_iot/lib/dials_grid.dart)
- [UI/garden_iot/lib/temperature_dial.dart](UI/garden_iot/lib/temperature_dial.dart)
- [UI/garden_iot/lib/temperature_model.dart](UI/garden_iot/lib/temperature_model.dart)
- [UI/garden_iot/lib/water_now_grid.dart](UI/garden_iot/lib/water_now_grid.dart)
- [UI/garden_iot/lib/water_now_button.dart](UI/garden_iot/lib/water_now_button.dart)
- [UI/garden_iot/lib/shadow_relay_model.dart](UI/garden_iot/lib/shadow_relay_model.dart)
- [UI/garden_iot/lib/log_model.dart](UI/garden_iot/lib/log_model.dart)
- [UI/garden_iot/lib/logger.dart](UI/garden_iot/lib/logger.dart)
- [UI/garden_iot/lib/utils/env.dart](UI/garden_iot/lib/utils/env.dart)
- [UI/garden_iot/test/serialization_test.dart](UI/garden_iot/test/serialization_test.dart)

Added:
- [UI/garden_iot/lib/theme/app_theme.dart](UI/garden_iot/lib/theme/app_theme.dart)
- [UI/garden_iot/lib/serialization/shadow_message.dart](UI/garden_iot/lib/serialization/shadow_message.dart)
- [UI/garden_iot/analysis_options.yaml](UI/garden_iot/analysis_options.yaml)

Deleted:
- [UI/garden_iot/lib/new_dial_button.dart](UI/garden_iot/lib/new_dial_button.dart)
- [UI/garden_iot/lib/dial_editor.dart](UI/garden_iot/lib/dial_editor.dart)
- [UI/garden_iot/lib/dial_type_dropdown.dart](UI/garden_iot/lib/dial_type_dropdown.dart)
- [UI/garden_iot/lib/sensor_id_picker.dart](UI/garden_iot/lib/sensor_id_picker.dart)
- [UI/garden_iot/lib/dial_grid_tile.dart](UI/garden_iot/lib/dial_grid_tile.dart)
- [UI/garden_iot/lib/serialization/open_closed.dart](UI/garden_iot/lib/serialization/open_closed.dart)
- [UI/garden_iot/lib/serialization/reported.dart](UI/garden_iot/lib/serialization/reported.dart)
- [UI/garden_iot/lib/serialization/reported_state.dart](UI/garden_iot/lib/serialization/reported_state.dart)
- [UI/garden_iot/lib/serialization/desired.dart](UI/garden_iot/lib/serialization/desired.dart)
- [UI/garden_iot/lib/serialization/desired_state.dart](UI/garden_iot/lib/serialization/desired_state.dart)
- [UI/garden_iot/lib/serialization/serialization_exception.dart](UI/garden_iot/lib/serialization/serialization_exception.dart)
- [UI/garden_iot/test/widget_test.dart](UI/garden_iot/test/widget_test.dart)

Moved:
- [UI/garden_iot/test/shadow_relay_model_test.dart](UI/garden_iot/test/shadow_relay_model_test.dart) → `test/integration/shadow_relay_model_test.dart` (skipped by default)

## Out of scope (explicit non-goals)

- **Secrets in `assets/certs/`**: the audit flagged that AWS IoT private keys are committed to the repo and shipped in the app bundle. This is a security concern but a separate workstream — credentials rotation, Cognito identity, build-time injection. Not touched here.
- **The `(envName)` chip showing prod vs dev**: this is the only nod to the dev/prod split. A proper build-flavor + flavor-specific assets setup is out of scope.
- **Replacing `provider` with Riverpod/Bloc**: provider is fine; just use it consistently.
- **Routing**: 3 tabs is plenty for the current feature set. No `go_router` introduction.
- **i18n**: English-only stays.

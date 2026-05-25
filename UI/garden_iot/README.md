# garden_iot

Flutter app (Android + iOS) for the GardenIOT system. Talks to the Pi
over AWS IoT Core MQTT using a shipped device certificate; reads the
temperature history and structured log archive via API Gateway / Lambda.

## Tabs

- **Sensors** — live + recent temperatures per probe (polled every 5s from `GET /temperature`).
- **Water** — per-bed cards with a Water-now switch and live reported state. Long-press a bed to rename it (writes `desired` on the `config` shadow).
- **Schedule** — view + edit the weekly watering schedule. Days, time, duration, and which beds run together. Saves are pushed as `desired` on the `config` shadow; the Pi reflects `reported` once it has rebuilt the plan.
- **Logs** — dual-stream live tail + paginated history with a **User / Technical** segmented control. User stream is friendly events (Watering "Greenhouse" started, Schedule updated, online/offline). Technical stream is the raw Pi log line for debugging. Both are live-tailed from MQTT and back-filled from `GET /logs` as you scroll.

## Layout

```
lib/
├── main.dart                       # providers + AppShell (4-tab Scaffold + lifecycle reconnect)
├── mqtt_gateway.dart               # MqttGatewayLike: connect/subscribe/publish/messages stream
├── shadow_relay_model.dart         # per-relay reported/desired tracked via `RELAY{1..4}` shadows
├── garden_config_model.dart        # bed names + schedule via the `config` shadow
├── temperature_model.dart          # REST poller for `/temperature`
├── log_model.dart                  # dual-stream ring buffers + pagination cursors
├── water_now_grid.dart             # Water tab grid + disconnected banner
├── schedule_screen.dart            # Schedule tab list
├── schedule_editor.dart            # add/edit a single job
├── bed_rename_sheet.dart           # long-press rename modal
├── dials_grid.dart, temperature_dial.dart
├── logger.dart                     # Logs tab UI (segmented control + infinite scroll)
├── water_now_button.dart
├── serialization/                  # GardenConfig + LogRecord shapes shared with the Pi
└── utils/                          # env (endpoint, cert paths, ids) + logs_api client
```

## Local development

```bash
flutter pub get
flutter test                    # 240+ widget + model tests
flutter test --coverage         # writes coverage/lcov.info
python3 tool/check_coverage.py  # enforces 95% line coverage
flutter run -d <device-id>      # debug build to a connected device
flutter build apk --release     # release APK in build/app/outputs/flutter-apk/
```

## AWS IoT certificate

The MQTT client authenticates with a per-app device cert checked into
`assets/certs/` (gitignored — pulled out of the AWS IoT console once and
shipped inside the app bundle). For tests, empty placeholders are fine;
CI creates them automatically. See [CLAUDE.md](../../CLAUDE.md) for the
known-limitation note on per-user identity.

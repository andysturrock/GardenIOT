import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/log_record.dart';
import 'package:garden_iot/utils/env.dart';
import 'package:garden_iot/utils/logs_api.dart';

/// Dual-stream log buffer feeding the Logs tab.
///
/// - `live{User,Technical}` hold recent records ingested from the broker
///   (or the legacy `log(String)` shim used by other models), capped per
///   category so the in-memory list cannot grow unbounded on long sessions.
/// - `history{User,Technical}` are paginated pages fetched from
///   `GET /logs`, appended below the live tail. Cursor advances via
///   `_oldestSeen*Ts` so successive pages stay strictly older.
///
/// Both live and history are stored most-recent-first. The widget renders
/// `live + history` in that order in a forward ListView.
class LogModel extends ChangeNotifier {
  static const int liveCap = 200;
  static const int pageSize = 50;

  final LogsApi _api;
  final bool _ownsApi;

  final Queue<LogRecord> _liveUser = Queue<LogRecord>();
  final Queue<LogRecord> _liveTechnical = Queue<LogRecord>();
  final List<LogRecord> _historyUser = <LogRecord>[];
  final List<LogRecord> _historyTechnical = <LogRecord>[];

  bool _isLoadingMoreUser = false;
  bool _isLoadingMoreTechnical = false;
  bool _hasMoreUser = true;
  bool _hasMoreTechnical = true;
  int? _oldestSeenUserTs;
  int? _oldestSeenTechnicalTs;

  MqttGatewayLike? _gateway;
  StreamSubscription<MqttDelivery>? _deliverySub;
  bool _subscribed = false;
  bool _disposed = false;

  LogModel({LogsApi? api})
      : _api = api ?? LogsApi(),
        _ownsApi = api == null;

  // ---- Read-side accessors -------------------------------------------------

  List<LogRecord> get liveUser => List.unmodifiable(_liveUser);
  List<LogRecord> get liveTechnical => List.unmodifiable(_liveTechnical);
  List<LogRecord> get historyUser => List.unmodifiable(_historyUser);
  List<LogRecord> get historyTechnical => List.unmodifiable(_historyTechnical);

  bool isLoadingMore(LogCategory cat) =>
      cat == LogCategory.user ? _isLoadingMoreUser : _isLoadingMoreTechnical;

  bool hasMore(LogCategory cat) =>
      cat == LogCategory.user ? _hasMoreUser : _hasMoreTechnical;

  /// `live + history` for the given category, most-recent-first. The widget
  /// renders this directly in a forward `ListView`.
  List<LogRecord> displayedFor(LogCategory cat) {
    final live = cat == LogCategory.user ? _liveUser : _liveTechnical;
    final hist = cat == LogCategory.user ? _historyUser : _historyTechnical;
    return List.unmodifiable([...live, ...hist]);
  }

  // ---- Live ingestion -----------------------------------------------------

  /// Append a fully-formed record from the broker (or anywhere). Caps the
  /// live queue at [liveCap] per category to bound memory.
  void ingestLive(LogRecord rec) {
    final queue =
        rec.category == LogCategory.user ? _liveUser : _liveTechnical;
    queue.addFirst(rec);
    while (queue.length > liveCap) {
      queue.removeLast();
    }
    _bumpOldestSeen(rec);
    notifyListeners();
  }

  // ---- History pagination -------------------------------------------------

  Future<void> loadMore(LogCategory cat) async {
    if (isLoadingMore(cat) || !hasMore(cat)) return;
    _setLoading(cat, true);
    try {
      final before = (cat == LogCategory.user
              ? _oldestSeenUserTs
              : _oldestSeenTechnicalTs) ??
          DateTime.now().millisecondsSinceEpoch;
      final page = await _api.fetchLogs(
        category: cat,
        before: before,
        limit: pageSize,
      );
      if (_disposed) return;
      _appendHistory(cat, page.logs);
      _setHasMore(cat, page.nextBefore != null);
    } catch (e) {
      // Mark hasMore=false so the UI stops trying; the error itself is
      // logged via the legacy log() shim so it surfaces in the Technical
      // tab on the next ingest.
      log('Logs fetch failed: $e');
      _setHasMore(cat, false);
    } finally {
      _setLoading(cat, false);
    }
  }

  void _appendHistory(LogCategory cat, List<LogRecord> incoming) {
    final hist = cat == LogCategory.user ? _historyUser : _historyTechnical;
    final live = cat == LogCategory.user ? _liveUser : _liveTechnical;
    // Dedupe against what we already know: a live-tail entry may have just
    // been persisted and then come back via the first HTTP page.
    final seen = <String>{
      for (final r in live) _key(r),
      for (final r in hist) _key(r),
    };
    for (final rec in incoming) {
      if (seen.add(_key(rec))) {
        hist.add(rec);
        _bumpOldestSeen(rec);
      }
    }
  }

  void _bumpOldestSeen(LogRecord rec) {
    if (rec.category == LogCategory.user) {
      if (_oldestSeenUserTs == null || rec.timestamp < _oldestSeenUserTs!) {
        _oldestSeenUserTs = rec.timestamp;
      }
    } else {
      if (_oldestSeenTechnicalTs == null ||
          rec.timestamp < _oldestSeenTechnicalTs!) {
        _oldestSeenTechnicalTs = rec.timestamp;
      }
    }
  }

  void _setLoading(LogCategory cat, bool v) {
    if (cat == LogCategory.user) {
      if (_isLoadingMoreUser == v) return;
      _isLoadingMoreUser = v;
    } else {
      if (_isLoadingMoreTechnical == v) return;
      _isLoadingMoreTechnical = v;
    }
    notifyListeners();
  }

  void _setHasMore(LogCategory cat, bool v) {
    if (cat == LogCategory.user) {
      _hasMoreUser = v;
    } else {
      _hasMoreTechnical = v;
    }
  }

  String _key(LogRecord r) => '${r.deviceId}|${r.timestamp}|${r.message}';

  // ---- MQTT binding -------------------------------------------------------

  /// Subscribe to `${deviceId}/logging`. Decodes each delivery as a
  /// [LogRecord] and pushes it through [ingestLive]. Bad payloads fall
  /// through to the legacy `log()` shim as a technical record.
  void bindGateway(MqttGatewayLike gateway) {
    if (_gateway != null) return;
    _gateway = gateway;
    gateway.addListener(_onGatewayChange);
    _onGatewayChange();
  }

  void _onGatewayChange() {
    final gw = _gateway;
    if (gw == null) return;
    if (gw.isConnected && !_subscribed) {
      _subscribed = true;
      _deliverySub ??= gw.messages.listen(_onDelivery);
      gw.subscribe(AppConfig.deviceLoggingTopic);
    }
    if (!gw.isConnected && _subscribed) {
      _subscribed = false;
    }
  }

  void _onDelivery(MqttDelivery msg) {
    if (msg.topic != AppConfig.deviceLoggingTopic) return;
    try {
      final json = jsonDecode(msg.payload);
      final rec = LogRecord.fromJson(json);
      ingestLive(rec);
    } catch (e) {
      log('Failed to decode log record on ${msg.topic}: $e');
    }
  }

  // ---- Legacy shims --------------------------------------------------------
  //
  // The pre-stage-7 surface was `log(String)` + a `messages` list. Models
  // (MqttGateway, ShadowRelayModel, TemperatureModel, GardenConfigModel)
  // and several tests still use it. The shim now ingests a technical
  // info-level record so those calls still appear in the Technical tab.

  void log(String message) {
    final rec = LogRecord(
      deviceId: AppConfig.deviceId,
      timestamp: DateTime.now().millisecondsSinceEpoch,
      level: LogLevel.info,
      category: LogCategory.technical,
      message: message,
    );
    ingestLive(rec);
  }

  /// String view of the technical live tail, **oldest-first**, mirroring
  /// the pre-stage-7 behaviour. Tests in other models still use
  /// `.messages.any((m) => m.contains(...))` patterns against this list.
  List<String> get messages {
    // _liveTechnical is most-recent-first; reverse for the legacy view.
    return List.unmodifiable([
      for (final r in _liveTechnical.toList().reversed)
        '${DateTime.fromMillisecondsSinceEpoch(r.timestamp)} - ${r.message}',
    ]);
  }

  @override
  void dispose() {
    _disposed = true;
    _deliverySub?.cancel();
    _gateway?.removeListener(_onGatewayChange);
    if (_ownsApi) _api.dispose();
    super.dispose();
  }
}

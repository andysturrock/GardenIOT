import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/utils/env.dart';

/// Mirrors the Pi-side ConfigShadow: subscribes to the named `config`
/// thing shadow and treats `state.desired` (or the seeded reported, on
/// first ever load) as the source of truth for bed names + watering jobs.
class GardenConfigModel with ChangeNotifier {
  static String get _base =>
      '\$aws/things/${AppConfig.deviceId}/shadow/name/config';

  final LogModel _logModel;
  final MqttGatewayLike _gateway;

  StreamSubscription<MqttDelivery>? _deliverySub;
  Timer? _pendingGetTimer;
  bool _subscribed = false;
  bool _disposed = false;
  int _version = 0;
  GardenConfig? _config;

  GardenConfigModel(this._logModel, this._gateway) {
    _gateway.addListener(_onGatewayChange);
    _onGatewayChange();
  }

  GardenConfig? get config => _config;

  /// Bed display name. Falls back to `Bed N` until the shadow has loaded
  /// or if the operator deletes a bed entry for some reason.
  String bedName(int relayId) =>
      _config?.beds[relayId.toString()]?.name ?? 'Bed $relayId';

  /// Returns the watering-jobs list if the shadow has loaded; empty list
  /// otherwise. Callers can render an empty state on null vs. empty if
  /// they want to distinguish "loading" from "no jobs".
  List<WateringJobConfig> get jobs => _config?.jobs ?? const [];

  /// Rename a single bed and publish the resulting desired config.
  /// No-ops if the shadow hasn't loaded or the relay id is unknown.
  void renameBed(int relayId, String name) {
    final cfg = _config;
    if (cfg == null) {
      _logModel.log('Cannot rename bed $relayId: config not loaded');
      return;
    }
    final key = relayId.toString();
    final trimmed = name.trim();
    if (trimmed.isEmpty) {
      _logModel.log('Cannot rename bed $relayId: name is empty');
      return;
    }
    final beds = Map<String, BedConfig>.from(cfg.beds);
    beds[key] = BedConfig(name: trimmed);
    publishConfig(cfg.copyWith(beds: beds));
  }

  /// Add or replace a single watering job (matched by id).
  /// No-ops if the shadow hasn't loaded.
  void upsertJob(WateringJobConfig job) {
    final cfg = _config;
    if (cfg == null) {
      _logModel.log('Cannot upsert job ${job.id}: config not loaded');
      return;
    }
    final next = List<WateringJobConfig>.from(cfg.jobs);
    final idx = next.indexWhere((j) => j.id == job.id);
    if (idx >= 0) {
      next[idx] = job;
    } else {
      next.add(job);
    }
    publishConfig(cfg.copyWith(jobs: next));
  }

  /// Remove a watering job by id. No-ops if the shadow hasn't loaded or
  /// the id is unknown.
  void deleteJob(String jobId) {
    final cfg = _config;
    if (cfg == null) {
      _logModel.log('Cannot delete job $jobId: config not loaded');
      return;
    }
    final next = cfg.jobs.where((j) => j.id != jobId).toList();
    if (next.length == cfg.jobs.length) return;
    publishConfig(cfg.copyWith(jobs: next));
  }

  /// Publish a full new desired-config. Used by bed-rename and the
  /// schedule editor.
  void publishConfig(GardenConfig next) {
    if (!_gateway.isConnected) {
      _logModel.log('Cannot publish config: MQTT not connected');
      return;
    }
    _gateway.publishJson('$_base/update', {
      'state': {'desired': next.toJson()}
    });
  }

  void _onGatewayChange() {
    if (_gateway.isConnected && !_subscribed) {
      _subscribed = true;
      _deliverySub ??= _gateway.messages.listen(_onDelivery);
      _subscribeAll();
      _publishGet();
    }
    if (!_gateway.isConnected && _subscribed) {
      _subscribed = false;
      // Keep _config so the UI doesn't blank on a transient drop;
      // the next get/accepted will refresh it.
    }
    notifyListeners();
  }

  void _subscribeAll() {
    _gateway.subscribe('$_base/get/accepted');
    _gateway.subscribe('$_base/get/rejected');
    _gateway.subscribe('$_base/update/accepted');
    _gateway.subscribe('$_base/update/rejected');
    _gateway.subscribe('$_base/update/delta');
    _gateway.subscribe('$_base/update/documents');
  }

  void _publishGet() {
    // Same 500ms guard as ShadowRelayModel — give the subscription a
    // moment to take effect on the broker side. Tracked so dispose can
    // cancel it cleanly during tests.
    _pendingGetTimer?.cancel();
    _pendingGetTimer = Timer(const Duration(milliseconds: 500), () {
      _pendingGetTimer = null;
      if (_disposed || !_gateway.isConnected) return;
      _gateway.publishJson('$_base/get', const <String, dynamic>{});
    });
  }

  void _onDelivery(MqttDelivery msg) {
    if (!msg.topic.startsWith(_base)) return;
    final tail = msg.topic.substring(_base.length);
    try {
      final json = jsonDecode(msg.payload) as Map<String, dynamic>;
      switch (tail) {
        case '/get/accepted':
          _onGetAccepted(json);
          break;
        case '/get/rejected':
          _onGetRejected(json);
          break;
        case '/update/delta':
          _onDelta(json);
          break;
        case '/update/accepted':
          _onUpdateAccepted(json);
          break;
        case '/update/documents':
          _onDocuments(json);
          break;
        case '/update/rejected':
          _logModel.log('Config update rejected: ${msg.payload}');
          break;
      }
    } catch (e) {
      _logModel.log('Failed to decode config shadow on ${msg.topic}: $e');
    }
  }

  void _onGetAccepted(Map<String, dynamic> json) {
    final version = (json['version'] as num?)?.toInt();
    if (version != null) _version = version;
    final state = json['state'];
    if (state is! Map) return;
    final desired = state['desired'];
    final reported = state['reported'];
    final raw = desired ?? reported;
    if (raw == null) {
      _logModel.log('Config shadow empty on get/accepted; waiting for Pi to seed');
      return;
    }
    _applyConfigFromJson(raw, source: 'get/accepted');
  }

  void _onGetRejected(Map<String, dynamic> json) {
    final code = json['code'];
    if (code == 404) {
      // The Pi will seed on first boot; nothing to do app-side.
      _logModel.log('Config shadow not yet seeded (404)');
    } else {
      _logModel.log('Config shadow get rejected: $json');
    }
  }

  void _onDelta(Map<String, dynamic> json) {
    final version = (json['version'] as num?)?.toInt();
    if (version == null || version <= _version) return;
    _version = version;
    final state = json['state'];
    if (state is! Map) return;
    _applyConfigFromJson(state, source: 'delta');
  }

  void _onUpdateAccepted(Map<String, dynamic> json) {
    final version = (json['version'] as num?)?.toInt();
    if (version != null && version > _version) _version = version;
  }

  void _onDocuments(Map<String, dynamic> json) {
    final current = json['current'];
    if (current is! Map) return;
    final version = (current['version'] as num?)?.toInt();
    if (version != null && version > _version) _version = version;
  }

  void _applyConfigFromJson(Object raw, {required String source}) {
    try {
      final next = GardenConfig.fromJson(raw);
      _config = next;
      _logModel.log('Config shadow applied from $source '
          '(${next.beds.length} beds, ${next.jobs.length} jobs)');
      notifyListeners();
    } on GardenConfigError catch (e) {
      _logModel.log('Invalid config from $source: $e');
    }
  }

  @override
  void dispose() {
    _disposed = true;
    _pendingGetTimer?.cancel();
    _pendingGetTimer = null;
    _gateway.removeListener(_onGatewayChange);
    _deliverySub?.cancel();
    super.dispose();
  }
}

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/shadow_relay_model.dart';

class _DiskAssetBundle extends AssetBundle {
  @override
  Future<ByteData> load(String key) async {
    final bytes = await File(key).readAsBytes();
    return ByteData.view(bytes.buffer);
  }

  @override
  Future<T> loadStructuredData<T>(
      String key, Future<T> Function(String value) parser) {
    throw UnimplementedError();
  }
}

void main() {
  test(
    'connects to dev MQTT broker and receives initial state',
    () async {
      final model = ShadowRelayModel(LogModel());
      final connected = await model.mqttConnect(_DiskAssetBundle());
      expect(connected, isTrue);
      // Allow time for the initial /get responses to flow back.
      await Future<void>.delayed(const Duration(seconds: 25));
      await model.mqttDisconnect();
    },
    skip: 'integration — requires live MQTT endpoint and dev certs on disk',
  );
}

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/log_model.dart';
import 'package:garden_iot/mqtt_gateway.dart';
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
      final logModel = LogModel();
      final gateway = MqttGateway(logModel);
      // ShadowRelayModel listens to the gateway for subscribe + publish.
      // ignore: unused_local_variable
      final model = ShadowRelayModel(logModel, gateway);
      final connected = await gateway.mqttConnect(_DiskAssetBundle());
      expect(connected, isTrue);
      // Allow time for the initial /get responses to flow back.
      await Future<void>.delayed(const Duration(seconds: 25));
      await gateway.mqttDisconnect();
    },
    skip: 'integration — requires live MQTT endpoint and dev certs on disk',
  );
}

import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/shadow_relay_model.dart';

class TestAssetBundle extends AssetBundle {
  @override
  Future<ByteData> load(String key) async {
    File file = new File(key);
    Uint8List bytes = await file.readAsBytes();
    return ByteData.view(bytes.buffer);
  }

  @override
  Future<T> loadStructuredData<T>(
      String key, Future<T> Function(String value) parser) {
    // TODO: implement loadStructuredData
    throw UnimplementedError();
  }
}

void onConnected() {
  print('onConnected');
}

void onDisconnected() {
  print('onDisconnected');
}

void stateChanged1(bool relayIsOpen) {
  print('stateChanged1 relay open? $relayIsOpen');
}

void stateChanged2(bool relayIsOpen) {
  print('stateChanged2 relay open? $relayIsOpen');
}

void main() {
  test('ShadowRelayModel works correctly', () async {
    ShadowRelayModel model = ShadowRelayModel();

    model.addOnConnectedCallback(onConnected);
    model.addOnDisconnectedCallback(onDisconnected);

    final testAssetBundle = TestAssetBundle();
    bool connected = await model.mqttConnect(testAssetBundle);
    if (connected) {
      print('Connected');
    }
    model.addRelayStateListener(1, stateChanged1);
    model.addRelayStateListener(2, stateChanged2);

    await Future.delayed(const Duration(milliseconds: 25 * 1000));

    model.removeRelayStateListener(1, stateChanged1);
    model.removeRelayStateListener(2, stateChanged2);
    model.mqttDisconnect();
    model.removeOnDisconnectedCallback(onDisconnected);
  });

  test('Test getting relay id from topic using Regex', () async {
    final topic =
        "\$aws/things/linux-vpc-3/shadow/name/RELAY123/update/accepted";
    final relayId = topic.replaceFirstMapped(
        RegExp(r".*/(RELAY([0-9]+))/update/accepted"),
        (match) => '${match[2]}');

    expect(relayId, "123");
  });
}

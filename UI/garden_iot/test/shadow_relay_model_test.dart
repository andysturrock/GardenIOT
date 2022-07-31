import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/cupertino.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:mockito/annotations.dart';
import 'package:mockito/mockito.dart';

class TestAssetBundle extends AssetBundle {
  @override
  Future<ByteData> load(String key) async {
    Directory cwd = Directory.current;
    print('cwd= ${cwd}');
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

void stateChanged(bool relayIsOpen) {
  print('stateChanged relay: ${relayIsOpen}');
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
    model.addRelayStateListener(1, stateChanged);

    await Future.delayed(const Duration(milliseconds: 25 * 1000));

    model.removeRelayStateListener(1, stateChanged);
    model.mqttDisconnect();
    model.removeOnDisconnectedCallback(onDisconnected);
  });
}

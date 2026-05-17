class SensorConfig {
  final String name;
  final int sensorId;
  final double minTemp;
  final double maxTemp;
  final double minComfort;
  final double maxComfort;

  const SensorConfig({
    required this.name,
    required this.sensorId,
    this.minTemp = -10,
    this.maxTemp = 50,
    this.minComfort = 10,
    this.maxComfort = 25,
  });
}

class RelayConfig {
  final String name;
  final int relayId;
  final IconCodepoint icon;

  const RelayConfig({
    required this.name,
    required this.relayId,
    this.icon = IconCodepoint.spa,
  });
}

enum IconCodepoint { spa, localFlorist, agriculture, grass }

class AppConfig {
  static const String rootCAPath = 'assets/certs/AmazonRootCA1.pem';

  static const String deviceCertPath =
      'assets/certs/5eb3ad97272b2323f222e6efad963ec376e28fc2ef344f17d5e858a11bffe96f-certificate.pem.crt';

  static const String privateKeyPath =
      'assets/certs/5eb3ad97272b2323f222e6efad963ec376e28fc2ef344f17d5e858a11bffe96f-private.pem.key';

  static const String iotEndPoint =
      'a2i5zcd57sb82b-ats.iot.eu-west-1.amazonaws.com';

  static const String clientId = 'prod-mobile-app';
  static const String deviceId = 'raspberrypi-1';
  static const String deviceLoggingTopic = '$deviceId/logging';

  static const bool mqttLogging = false;

  static const String temperatureApiHost = 'api.gardeniot.goatsinlace.com';
  static const String temperatureApiPath = '/0_0_1/temperature';

  static const List<SensorConfig> sensors = [
    SensorConfig(name: 'Greenhouse', sensorId: 1),
    SensorConfig(name: 'Outside', sensorId: 2),
  ];

  static const List<RelayConfig> relays = [
    RelayConfig(name: 'Greenhouse', relayId: 1, icon: IconCodepoint.spa),
    RelayConfig(name: 'Flowers', relayId: 2, icon: IconCodepoint.localFlorist),
    RelayConfig(name: 'Strawberries', relayId: 3, icon: IconCodepoint.agriculture),
    RelayConfig(name: 'Sweetcorn', relayId: 4, icon: IconCodepoint.grass),
  ];

  const AppConfig._();
}

const bool isProduction = bool.fromEnvironment('dart.vm.product');

/// Class to store environment (ie dev, prod) versions of variables.
/// TODO make much more flexible and configurable.
class Env {
  static envName() {
    return isProduction ? 'Production' : 'Test';
  }

  static String rootCAPath() {
    return 'assets/certs/AmazonRootCA1.pem';
  }

  static String deviceCertPath() {
    return isProduction
        ? 'assets/certs/05c12aa55939f18c6f71c323605d3d686443999b7ab3c5a560c77fd885c7d71f-certificate.pem.crt'
        : 'assets/certs/bb381ae692c9965e9996ab013d428e49a05d1ac15eacc08ae555e3eb414014aa-certificate.pem.crt';
  }

  static String privateKeyPath() {
    return isProduction
        ? 'assets/certs/05c12aa55939f18c6f71c323605d3d686443999b7ab3c5a560c77fd885c7d71f-private.pem.key'
        : 'assets/certs/bb381ae692c9965e9996ab013d428e49a05d1ac15eacc08ae555e3eb414014aa-private.pem.key';
  }

  static String iotEndPoint() {
    return isProduction
        ? 'a2i5zcd57sb82b-ats.iot.eu-west-1.amazonaws.com'
        : 'a2cy4c2yyuss64-ats.iot.eu-west-1.amazonaws.com';
  }

  static String clientId() {
    return isProduction ? 'prod-mobile-app' : 'dev-mobile-app';
  }

  static String deviceId() {
    return isProduction ? 'raspberrypi-1' : 'linux-vpc-3';
  }

  static String deviceLoggingTopic() {
    return isProduction ? 'raspberrypi-1/logging' : 'linux-vpc-3/logging';
  }

  static bool mqttLogging() {
    return isProduction ? false : true;
  }
}

class SerializationException implements Exception {
  SerializationException(String message) : _s = message;
  String toString() => "SerializationException: '$_s'";
  final String _s;
}

import 'package:garden_iot/serialization/open_closed.dart';

class Desired {
  final OpenClosed openClosed;
  Desired(this.openClosed);

  Desired.fromJson(Map<String, dynamic> json)
      : openClosed = OpenClosed.fromJson(json['desired']);

  Map<String, OpenClosed?> toJson() => {'desired': openClosed};

  @override
  bool operator ==(Object other) =>
      other is Desired &&
      other.runtimeType == runtimeType &&
      other.openClosed == openClosed;

  @override
  int get hashCode => openClosed.hashCode;
}

import 'package:garden_iot/serialization/open_closed.dart';

class Reported {
  final OpenClosed openClosed;
  Reported(this.openClosed);

  Reported.fromJson(Map<String, dynamic> json)
      : openClosed = OpenClosed.fromJson(json['reported']);

  Map<String, OpenClosed?> toJson() => {'reported': openClosed};

  @override
  bool operator ==(Object other) =>
      other is Reported &&
      other.runtimeType == runtimeType &&
      other.openClosed == openClosed;

  @override
  int get hashCode => openClosed.hashCode;
}

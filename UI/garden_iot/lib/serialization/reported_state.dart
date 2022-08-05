import 'package:garden_iot/serialization/reported.dart';

class ReportedState {
  final Reported reported;

  ReportedState(this.reported);

  ReportedState.fromJson(Map<String, dynamic> json)
      : reported = Reported.fromJson(json['state']);

  Map<String, dynamic> toJson() => {'state': reported};

  @override
  bool operator ==(Object other) =>
      other is ReportedState &&
      other.runtimeType == runtimeType &&
      other.reported == reported;

  @override
  int get hashCode => reported.hashCode;
}

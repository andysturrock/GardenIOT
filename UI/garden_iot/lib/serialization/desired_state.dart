import 'package:garden_iot/serialization/desired.dart';

class DesiredState {
  final Desired desired;

  DesiredState(this.desired);

  DesiredState.fromJson(Map<String, dynamic> json)
      : desired = Desired.fromJson(json['state']);

  Map<String, dynamic> toJson() => {'state': desired};

  @override
  bool operator ==(Object other) =>
      other is DesiredState &&
      other.runtimeType == runtimeType &&
      other.desired == desired;

  @override
  int get hashCode => desired.hashCode;
}

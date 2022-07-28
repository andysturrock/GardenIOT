class OpenClosed {
  final String open_closed;

  OpenClosed(this.open_closed);

  OpenClosed.fromJson(Map<String, dynamic> json)
      : open_closed = json['open_closed'];

  Map<String, dynamic> toJson() => {'open_closed': open_closed};

  @override
  bool operator ==(Object other) =>
      other is OpenClosed &&
      other.runtimeType == runtimeType &&
      other.open_closed == open_closed;

  @override
  int get hashCode => open_closed.hashCode;
}

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

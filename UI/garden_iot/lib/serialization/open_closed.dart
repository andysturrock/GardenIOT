class OpenClosed {
  final String openClosed;

  OpenClosed(this.openClosed);

  OpenClosed.fromJson(Map<String, dynamic> json)
      : openClosed = json['open_closed'];

  Map<String, dynamic> toJson() => {'open_closed': openClosed};

  @override
  bool operator ==(Object other) =>
      other is OpenClosed &&
      other.runtimeType == runtimeType &&
      other.openClosed == openClosed;

  @override
  int get hashCode => openClosed.hashCode;
}

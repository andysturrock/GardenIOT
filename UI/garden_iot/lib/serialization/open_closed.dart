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

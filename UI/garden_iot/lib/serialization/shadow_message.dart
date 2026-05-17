enum RelayState {
  open,
  closed;

  static RelayState? fromJsonString(String? value) {
    switch (value) {
      case 'open':
        return RelayState.open;
      case 'closed':
        return RelayState.closed;
      default:
        return null;
    }
  }

  String toJsonString() => name;

  bool get isOpen => this == RelayState.open;
}

class ShadowMessage {
  final RelayState? reported;
  final RelayState? desired;

  const ShadowMessage({this.reported, this.desired});

  factory ShadowMessage.fromJson(Map<String, dynamic> json) {
    final state = json['state'] as Map<String, dynamic>?;
    if (state == null) {
      return const ShadowMessage();
    }
    final reported = state['reported'] as Map<String, dynamic>?;
    final desired = state['desired'] as Map<String, dynamic>?;
    return ShadowMessage(
      reported: RelayState.fromJsonString(reported?['open_closed'] as String?),
      desired: RelayState.fromJsonString(desired?['open_closed'] as String?),
    );
  }

  static Map<String, dynamic> desiredUpdate(RelayState state) => {
        'state': {
          'desired': {'open_closed': state.toJsonString()}
        }
      };

  @override
  bool operator ==(Object other) =>
      other is ShadowMessage &&
      other.reported == reported &&
      other.desired == desired;

  @override
  int get hashCode => Object.hash(reported, desired);
}

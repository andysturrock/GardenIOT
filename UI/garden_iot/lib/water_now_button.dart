import 'package:flutter/material.dart';
import 'package:garden_iot/shadow_relay_model.dart';

class WaterNowButton extends StatefulWidget {
  final String _name;
  final int _relayId;
  final ShadowRelayModel _model;

  WaterNowButton(this._name, this._relayId, this._model);

  @override
  _WaterNowButtonState createState() => _WaterNowButtonState();
}

class _WaterNowButtonState extends State<WaterNowButton> {
  bool _relayIsOpen = false;
  @override
  void initState() {
    super.initState();
    widget._model.addRelayStateListener(widget._relayId, onRelayStateChange);
  }

  @override
  void dispose() {
    super.dispose();
    widget._model.removeRelayStateListener(widget._relayId, onRelayStateChange);
  }

  onRelayStateChange(bool state) {
    setState(() {
      _relayIsOpen = state;
    });
  }

  Future<void> _setShadowState(int relayId, bool openClosed) async {
    widget._model.updateState(relayId, openClosed);
  }

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: <Widget>[
          Text(widget._name),
          Switch(
            value: _relayIsOpen,
            onChanged: (value) {
              _setShadowState(widget._relayId, value);
            },
          ),
        ],
      ),
    );
  }
}

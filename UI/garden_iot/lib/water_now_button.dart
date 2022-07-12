import 'package:flutter/material.dart';

class WaterNowButton extends StatefulWidget {
  final String _name;
  final int _relayid;
  WaterNowButton(String name, int relayId)
      : this._name = name,
        this._relayid = relayId;

  @override
  _WaterNowButtonState createState() => _WaterNowButtonState();
}

class _WaterNowButtonState extends State<WaterNowButton> {
  Future<void> _setShadowState(int relayId, bool onOff) async {
    await Future.delayed(Duration(seconds: 3));
    debugPrint('finished sending: $relayId to $onOff');
  }

  bool isSwitched = false;
  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        children: <Widget>[
          Text(widget._name),
          Switch(
            value: isSwitched,
            onChanged: (value) {
              setState(() {
                isSwitched = value;
              });
              debugPrint('onChanged: $value');
              _setShadowState(widget._relayid, value);
            },
          ),
        ],
      ),
    );
  }
}

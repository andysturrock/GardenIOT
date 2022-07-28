import 'package:flutter/material.dart';
import 'package:garden_iot/shadow_relay_model.dart';
import 'package:garden_iot/water_now_button.dart';
import 'package:provider/provider.dart';

class WaterNowGrid extends StatefulWidget {
  @override
  _WaterNowGridState createState() => _WaterNowGridState();
}

class _WaterNowGridState extends State<WaterNowGrid> {
  String _footerStatus = "Disconnected";
  bool _isConnected = false;

  @override
  Widget build(BuildContext context) {
    print('********** build ${_isConnected}');
    ShadowRelayModel model = context.read<ShadowRelayModel>();
    model.addOnConnectedCallback(onConnected);
    model.addOnDisconnectedCallback(onDisConnected);
    List<Widget> children = _isConnected
        ? [_body(context), _footer()]
        : [CircularProgressIndicator(), _footer()];

    return SafeArea(
        child: Column(
      children: children,
    ));
  }

  Widget _body(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    ShadowRelayModel model = context.read<ShadowRelayModel>();
    var switches = <Widget>[
      // TODO get this from config somewhere
      WaterNowButton("Greenhouse", 1, model),
      WaterNowButton("Flowers", 2, model),
      WaterNowButton("Strawberries", 3, model),
      WaterNowButton("Sweetcorn", 4, model),
    ];
    final gridView = GridView.builder(
        shrinkWrap: true,
        itemCount: switches.length,
        gridDelegate: new SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: (orientation == Orientation.portrait) ? 2 : 3),
        itemBuilder: (BuildContext context, int index) {
          return switches[index];
        });
    return gridView;
  }

  Widget _footer() {
    return Expanded(child: Text(_footerStatus));
  }

  void onConnected() {
    setState(() {
      _footerStatus = "Connected";
      _isConnected = true;
    });
  }

  void onDisConnected() {
    setState(() {
      _footerStatus = "Disconnected";
      _isConnected = false;
    });
  }
}

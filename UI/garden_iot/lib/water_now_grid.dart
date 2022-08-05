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
  ShadowRelayModel? _model;

  @override
  void initState() {
    super.initState();
    _model = context.read<ShadowRelayModel>();
    _model?.addOnConnectedCallback(onConnected);
    _model?.addOnDisconnectedCallback(onDisconnected);
    () async {
      AssetBundle bundle = DefaultAssetBundle.of(context);
      _isConnected = await _model?.mqttConnect(bundle) ?? false;
    }();
  }

  @override
  void dispose() {
    _model?.removeOnConnectedCallback(onConnected);
    _model?.removeOnDisconnectedCallback(onDisconnected);
    _model?.mqttDisconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final children = _isConnected
        ? [_body(context), _footer()]
        : [CircularProgressIndicator(), _footer()];
    return SafeArea(
        child: Column(
      children: children,
    ));
  }

  Widget _body(BuildContext context) {
    final orientation = MediaQuery.of(context).orientation;
    var switches = <Widget>[
      // TODO get this from config somewhere
      WaterNowButton("Greenhouse", 1, _model!),
      WaterNowButton("Flowers", 2, _model!),
      WaterNowButton("Strawberries", 3, _model!),
      WaterNowButton("Sweetcorn", 4, _model!),
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

  void onDisconnected() {
    setState(() {
      _footerStatus = "Disconnected";
      _isConnected = false;
    });
  }
}

import 'package:flutter/material.dart';

class DialGridTile extends StatefulWidget {
  final int index;
  final Widget dial;
  final void Function()? onLongPress;

  DialGridTile(
      {required this.index,
      required this.dial,
      void Function()? this.onLongPress}) {}

  @override
  _DialGridTileState createState() => _DialGridTileState();
}

class _DialGridTileState extends State<DialGridTile> {
  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () => widget.onLongPress?.call(),
      child: widget.dial,
    );
  }
}

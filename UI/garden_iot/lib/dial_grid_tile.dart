import 'package:flutter/material.dart';

class DialGridTile extends StatefulWidget {
  final int initialIndex;
  final Widget dial;
  final void Function(int) onDeleteTile;

  DialGridTile(
      {Key? key,
      required this.initialIndex,
      required this.dial,
      required void Function(int) this.onDeleteTile})
      : super(key: key) {}

  @override
  _DialGridTileState createState() => _DialGridTileState(initialIndex);
}

class _DialGridTileState extends State<DialGridTile> {
  int currentIndex;
  _DialGridTileState(this.currentIndex) {}

  void _ShowPopupMenu() {
    Future<dynamic> result = showMenu(
        context: context,
        items: <PopupMenuEntry>[
          PopupMenuItem(
            value: widget.initialIndex,
            child: Row(
              children: <Widget>[
                Icon(Icons.delete),
                Text("Delete"),
              ],
            ),
          )
        ],
        position: RelativeRect.fill);

    result.then((value) {
      if (value != null) {
        widget.onDeleteTile(value);
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onLongPress: () => _ShowPopupMenu(),
      child: widget.dial,
    );
  }
}

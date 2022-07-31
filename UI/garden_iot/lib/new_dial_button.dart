import 'package:flutter/material.dart';
import 'package:garden_iot/dial_editor.dart';

class NewDialButton extends StatelessWidget {
  final void Function(DialAttributes)? onPressed;

  NewDialButton({this.onPressed});

  Future<DialAttributes?> _displayDialEditorDialog(BuildContext context) async {
    return await showDialog(
        context: context,
        builder: (BuildContext context) {
          final dialEditor = DialEditor();
          return AlertDialog(
            title: Text('Add new sensor'),
            content: dialEditor,
            actions: <Widget>[
              TextButton(
                child: Text('CANCEL'),
                onPressed: () {
                  Navigator.pop(context);
                },
              ),
              TextButton(
                child: Text('OK'),
                onPressed: () {
                  Navigator.pop(context, dialEditor.dialAttributes);
                },
              ),
            ],
          );
        });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        IconButton(
          icon: const Icon(Icons.add_box),
          tooltip: 'Add new sensor',
          onPressed: () async {
            DialAttributes? dialAttributes =
                await _displayDialEditorDialog(context);
            if (dialAttributes != null) {
              onPressed?.call(dialAttributes);
            } else {
              print("The user pressed cancel or back");
            }
          },
        ),
        Text('Add new sensor')
      ],
    );
  }
}

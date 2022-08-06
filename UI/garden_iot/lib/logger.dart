import 'package:flutter/material.dart';
import 'package:garden_iot/log_model.dart';
import 'package:provider/provider.dart';

class Logger extends StatefulWidget {
  @override
  _LoggerState createState() => _LoggerState();
}

class _LoggerState extends State<Logger> with LogListener {
  LogModel? _model;
  List<String> _logMessages = [];
  int numLogMessagesToKeep = 5;

  @override
  void initState() {
    super.initState();
    _model = context.read<LogModel>();
    _model?.addLogListener(this);
    if (_model != null) {
      _logMessages = _model!.getLogMessages();
    }
  }

  @override
  void dispose() {
    _model?.removeLogListener(this);
    super.dispose();
  }

  void onLogMessage(String logMessage) {
    _logMessages.removeAt(0);
    setState(() {
      _logMessages.add(logMessage);
    });
  }

  @override
  Widget build(BuildContext context) {
    return ListView.separated(
      padding: const EdgeInsets.all(8),
      itemCount: _logMessages.length,
      itemBuilder: (BuildContext context, int index) {
        return Container(
          height: 50,
          child: Center(
              child: Text(
            '${_logMessages[index]}',
            style: TextStyle(
                fontFamily: 'Courier',
                fontSize: 12,
                fontWeight: FontWeight.bold),
          )),
        );
      },
      separatorBuilder: (BuildContext context, int index) => const Divider(),
    );
  }
}

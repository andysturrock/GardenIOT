import 'package:garden_iot/serialization/garden_config.dart';
import 'package:timezone/timezone.dart' as tz;

/// Earliest future fire time for [job] in the [tzName] timezone, strictly
/// after [now]. Returned as a [tz.TZDateTime] so callers reading
/// `.hour` / `.day` / `.weekday` get the wall-clock values **in the
/// config tz**, not the device tz. Throws [tz.LocationNotFoundException]
/// if the tz name isn't known to the loaded tz database — caller should
/// ensure `timezone/data/latest.dart` has been initialized.
tz.TZDateTime nextFire(WateringJobConfig job, String tzName, DateTime now) {
  final location = tz.getLocation(tzName);
  final localNow = tz.TZDateTime.from(now, location);

  // job.days is ISO (1=Mon..7=Sun); DateTime.weekday uses the same mapping.
  // Walk up to 8 days forward so today is checked at offset 0 and the
  // next instance of today's weekday is checked at offset 7 if needed.
  for (var offset = 0; offset < 8; offset++) {
    final candidateDate = localNow.add(Duration(days: offset));
    if (!job.days.contains(candidateDate.weekday)) continue;
    final candidate = tz.TZDateTime(
      location,
      candidateDate.year,
      candidateDate.month,
      candidateDate.day,
      job.hour,
      job.minute,
    );
    if (candidate.isAfter(localNow)) return candidate;
  }

  // Unreachable: with a non-empty days set, one of the next 8 days must match.
  throw StateError('no next fire found for job ${job.id} (days=${job.days})');
}

/// Formats a duration as a compact countdown for the schedule UI:
/// `in 2d 3h`, `in 5h 12m`, `in 7m`, `now`.
String formatCountdown(Duration d) {
  if (d.inMinutes < 1) return 'now';
  if (d.inHours < 1) return 'in ${d.inMinutes}m';
  if (d.inDays < 1) {
    final h = d.inHours;
    final m = d.inMinutes - h * 60;
    return 'in ${h}h ${m}m';
  }
  final days = d.inDays;
  final h = d.inHours - days * 24;
  return 'in ${days}d ${h}h';
}

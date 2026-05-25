import 'package:flutter_test/flutter_test.dart';
import 'package:garden_iot/serialization/garden_config.dart';
import 'package:garden_iot/utils/next_fire.dart';
import 'package:timezone/data/latest.dart' as tz_data;
import 'package:timezone/timezone.dart' as tz;

WateringJobConfig _job({
  List<int> days = const [1, 2, 3, 4, 5, 6, 7],
  int hour = 8,
  int minute = 0,
}) =>
    WateringJobConfig(
      id: 'j',
      days: days,
      hour: hour,
      minute: minute,
      durationS: 600,
      relays: const [1],
    );

void main() {
  setUpAll(() => tz_data.initializeTimeZones());

  group('nextFire', () {
    test('returns today if the time is still ahead', () {
      // 06:00 UTC = 07:00 BST on 2026-05-25 (Mon). Job fires at 08:00 BST.
      final now = DateTime.utc(2026, 5, 25, 6, 0);
      final fire = nextFire(_job(), 'Europe/London', now);
      expect(fire.toUtc(), DateTime.utc(2026, 5, 25, 7, 0));
    });

    test('rolls to tomorrow if the time has already passed', () {
      // 08:01 BST on Mon — passed today's 08:00 fire.
      final now = DateTime.utc(2026, 5, 25, 7, 1);
      final fire = nextFire(_job(), 'Europe/London', now);
      expect(fire.toUtc(), DateTime.utc(2026, 5, 26, 7, 0));
    });

    test('skips days not in the days list', () {
      // Job fires Mon+Wed only. now=Mon 09:00 BST -> next is Wed 08:00 BST.
      final now = DateTime.utc(2026, 5, 25, 8, 0);
      final fire = nextFire(
        _job(days: const [1, 3]),
        'Europe/London',
        now,
      );
      expect(fire.toUtc(), DateTime.utc(2026, 5, 27, 7, 0));
    });

    test('handles a single-day schedule that wraps the week', () {
      // Job fires Sun only. now=Mon 09:00 BST -> next is following Sun.
      final now = DateTime.utc(2026, 5, 25, 8, 0);
      final fire = nextFire(
        _job(days: const [7]),
        'Europe/London',
        now,
      );
      expect(fire.toUtc(), DateTime.utc(2026, 5, 31, 7, 0));
    });

    test('respects config tz independent of device tz', () {
      // 08:00 in Europe/London BST is 07:00 UTC; in America/New_York EDT
      // it would be 12:00 UTC. Same UTC `now`, different tz -> different
      // next fire.
      final now = DateTime.utc(2026, 5, 25, 6, 0);
      final london = nextFire(_job(), 'Europe/London', now);
      final ny = nextFire(_job(), 'America/New_York', now);
      expect(london.toUtc(), DateTime.utc(2026, 5, 25, 7, 0));
      expect(ny.toUtc(), DateTime.utc(2026, 5, 25, 12, 0));
    });

    test('survives DST spring-forward', () {
      // UK spring-forward 2026: 01:00 UTC on Sun 2026-03-29 jumps from
      // 01:00 GMT to 02:00 BST. A 08:00 daily job on Sat should fire on
      // Sun in BST, not crash.
      final now = DateTime.utc(2026, 3, 28, 9, 0); // Sat 09:00 GMT
      final fire = nextFire(_job(), 'Europe/London', now);
      // After spring-forward Sun is BST (+1), so 08:00 BST = 07:00 UTC.
      expect(fire.toUtc(), DateTime.utc(2026, 3, 29, 7, 0));
    });

    test('throws on unknown tz', () {
      expect(
        () => nextFire(_job(), 'Mars/Olympus_Mons', DateTime.utc(2026, 5, 25)),
        throwsA(isA<tz.LocationNotFoundException>()),
      );
    });
  });

  group('formatCountdown', () {
    test('< 1 minute reads as "now"', () {
      expect(formatCountdown(const Duration(seconds: 30)), 'now');
      expect(formatCountdown(Duration.zero), 'now');
    });

    test('minutes only when under an hour', () {
      expect(formatCountdown(const Duration(minutes: 7)), 'in 7m');
      expect(formatCountdown(const Duration(minutes: 59)), 'in 59m');
    });

    test('hours and minutes when under a day', () {
      expect(formatCountdown(const Duration(hours: 1)), 'in 1h 0m');
      expect(
        formatCountdown(const Duration(hours: 3, minutes: 12)),
        'in 3h 12m',
      );
      expect(formatCountdown(const Duration(hours: 23, minutes: 59)),
          'in 23h 59m');
    });

    test('days and hours when ≥ a day', () {
      expect(formatCountdown(const Duration(days: 1)), 'in 1d 0h');
      expect(formatCountdown(const Duration(days: 2, hours: 5)), 'in 2d 5h');
      expect(formatCountdown(const Duration(days: 6, hours: 23)), 'in 6d 23h');
    });
  });
}

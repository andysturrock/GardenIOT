#!/usr/bin/env python3
"""Parse coverage/lcov.info and fail if the overall line coverage drops
below MIN_COVERAGE (default 95%).

Some files are excluded:
  - lib/shadow_relay_model.dart — the MQTT-bound code is exercised by
    the (skipped) integration test under test/integration/. Unit-testing
    it would need a wholesale refactor to inject a fake MqttServerClient,
    which is out of scope.

Run from the Flutter project root (UI/garden_iot):
    flutter test --coverage
    python3 tool/check_coverage.py [--min 95]
"""

import argparse
import re
import sys
from pathlib import Path

EXCLUDE = {'lib/shadow_relay_model.dart'}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument('--lcov', default='coverage/lcov.info')
    p.add_argument('--min', type=float, default=95.0,
                   help='Minimum overall line coverage percentage')
    args = p.parse_args()

    lcov_path = Path(args.lcov)
    if not lcov_path.exists():
        print(f'ERROR: {lcov_path} not found. Run `flutter test --coverage` first.',
              file=sys.stderr)
        return 2

    data = lcov_path.read_text()
    total_lf = total_lh = 0
    rows = []
    for block in data.split('end_of_record'):
        sf = re.search(r'^SF:(.+)$', block, re.M)
        lf = re.search(r'^LF:(\d+)', block, re.M)
        lh = re.search(r'^LH:(\d+)', block, re.M)
        if not (sf and lf and lh):
            continue
        name = sf.group(1).strip()
        lf_n, lh_n = int(lf.group(1)), int(lh.group(1))
        excluded = name in EXCLUDE
        pct = lh_n / lf_n * 100 if lf_n else 0
        rows.append((name, lh_n, lf_n, pct, excluded))
        if not excluded:
            total_lf += lf_n
            total_lh += lh_n

    print(f'{"file":50}  cov%       hit/total')
    print('-' * 75)
    for name, lh, lf, pct, excluded in sorted(rows):
        tag = '  [EXCLUDED]' if excluded else ''
        print(f'{name:50}  {pct:5.1f}%    {lh}/{lf}{tag}')

    overall = total_lh / total_lf * 100 if total_lf else 0
    print('-' * 75)
    print(f'Overall (excluding {len(EXCLUDE)} file(s)): {overall:.2f}% '
          f'({total_lh}/{total_lf})')
    print(f'Threshold: {args.min:.2f}%')

    if overall < args.min:
        print(f'\nFAIL: overall coverage {overall:.2f}% < {args.min:.2f}%',
              file=sys.stderr)
        return 1
    print(f'\nOK: overall coverage {overall:.2f}% >= {args.min:.2f}%')
    return 0


if __name__ == '__main__':
    sys.exit(main())

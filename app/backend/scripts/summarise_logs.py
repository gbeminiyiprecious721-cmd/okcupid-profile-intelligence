"""Summarise the application's request log lines: counts, errors and latency. Reads standard input, prints a report.

Usage:  <platform log command> | python summarise_logs.py [--max-5xx-rate 0.02] [--max-p95-ms 500]

The lines hold only a route template, a status and a timing (see profile_api/security/request_log.py), so this report
cannot contain anything a visitor sent. Lines that are not request lines (start up messages, platform noise) are
ignored. Exit code 1 means a threshold was crossed, so it can drive an alert.
"""

import argparse
import json
import statistics
import sys
from collections import Counter, defaultdict


def parse(stream) -> list[dict]:
    rows = []
    for line in stream:
        line = line.strip()
        start = line.find("{")
        if start < 0:
            continue
        try:
            row = json.loads(line[start:])
        except ValueError:
            continue
        if isinstance(row, dict) and row.get("event") == "request" and {"route", "status", "ms"} <= row.keys():
            rows.append(row)
    return rows


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, round(p / 100 * (len(ordered) - 1)))]


def summarise(rows: list[dict]) -> dict:
    by_route: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_route[row["route"]].append(row)
    statuses = Counter(row["status"] for row in rows)
    total = len(rows)
    return {
        "requests": total,
        "status_counts": dict(sorted(statuses.items())),
        "rate_5xx": round(sum(n for s, n in statuses.items() if s >= 500) / total, 4) if total else 0.0,
        "rate_429": round(statuses.get(429, 0) / total, 4) if total else 0.0,
        "p95_ms_all": round(percentile([r["ms"] for r in rows], 95), 1) if total else 0.0,
        "routes": {
            route: {
                "requests": len(items),
                "errors_5xx": sum(1 for r in items if r["status"] >= 500),
                "median_ms": round(statistics.median(r["ms"] for r in items), 1),
                "p95_ms": round(percentile([r["ms"] for r in items], 95), 1),
            }
            for route, items in sorted(by_route.items())
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-5xx-rate", type=float, default=0.02)
    parser.add_argument("--max-p95-ms", type=float, default=500.0)
    args = parser.parse_args()
    report = summarise(parse(sys.stdin))
    print(json.dumps(report, indent=2))
    if report["requests"] == 0:
        print("no request lines found", file=sys.stderr)
        return 2
    problems = []
    if report["rate_5xx"] > args.max_5xx_rate:
        problems.append(f"5xx rate {report['rate_5xx']:.1%} is over {args.max_5xx_rate:.1%}")
    if report["p95_ms_all"] > args.max_p95_ms:
        problems.append(f"p95 latency {report['p95_ms_all']} ms is over {args.max_p95_ms} ms")
    for problem in problems:
        print("ALERT:", problem, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

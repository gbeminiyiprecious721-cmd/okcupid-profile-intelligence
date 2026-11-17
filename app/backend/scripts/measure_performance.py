"""Measure start up time, memory and API latency of the real server, in public mode and in local mode.

Run from app/backend:
    .venv/bin/python scripts/measure_performance.py                  # starts uvicorn itself, public and local mode
    .venv/bin/python scripts/measure_performance.py --url http://127.0.0.1:8080 --out FILE.json   # an already running server

Sends requests over one keep alive connection and records p50, p95 and p99 latency per endpoint. When it starts the
server itself it also records start up time and resident memory. For a container, read memory with `docker stats`.
Nothing about the requests is stored beyond these numbers. The text sent is fictional.
"""

import argparse
import http.client
import json
import os
import socket
import statistics
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

BACKEND = Path(__file__).resolve().parents[1]
REPORT = BACKEND.parent / "planning" / "phase7_performance.json"
EXAMPLE = "ex_782bfd92"
TEXT = "I spend weekends in second hand bookshops, drink too much tea, and write poems and short novels in a notebook."


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def rss_mb(pid: int) -> float:
    out = subprocess.run(["ps", "-o", "rss=", "-p", str(pid)], capture_output=True, text=True).stdout  # noqa: S603, S607
    return int(out.strip()) / 1024


def percentile(values: list[float], p: float) -> float:
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(round(p / 100 * (len(ordered) - 1))))]


def run_cases(host: str, port: int, include_classifier: bool, repeats: int = 200) -> dict:
    connection = http.client.HTTPConnection(host, port, timeout=30)

    def call(method, path, body=None):
        t = time.perf_counter()
        connection.request(
            method, path, body=json.dumps(body) if body else None, headers={"Content-Type": "application/json"}
        )
        response = connection.getresponse()
        payload = response.read()
        return (time.perf_counter() - t) * 1000, response.status, len(payload)

    cases = {
        "GET /health": ("GET", "/api/v1/health", None),
        "GET /meta": ("GET", "/api/v1/meta", None),
        "GET /lab/summary": ("GET", "/api/v1/lab/summary", None),
        "GET /lab/figures (PNG)": ("GET", "/api/v1/lab/figures/confusion_matrix", None),
        "GET /examples": ("GET", "/api/v1/examples", None),
        "GET /discover/profiles/{id}": ("GET", f"/api/v1/discover/profiles/{EXAMPLE}", None),
        "POST /discover/similar (both, k=5)": ("POST", "/api/v1/discover/similar", {"text": TEXT}),
        "POST /discover/similar (both, k=10)": ("POST", "/api/v1/discover/similar", {"text": TEXT, "k": 10}),
        "POST /discover/similar (embeddings)": ("POST", "/api/v1/discover/similar", {"text": TEXT, "method": "embeddings"}),
        "POST /discover/similar (tfidf)": ("POST", "/api/v1/discover/similar", {"text": TEXT, "method": "tfidf"}),
        "POST /discover/similar (2000 characters)": ("POST", "/api/v1/discover/similar", {"text": (TEXT + " ") * 18}),
    }  # fmt: skip
    if include_classifier:
        cases["GET /classify/examples"] = ("GET", "/api/v1/classify/examples", None)
        cases["POST /classify/predict"] = ("POST", "/api/v1/classify/predict", {"example_id": EXAMPLE})
    cases["GET / (web page)"] = ("GET", "/", None)
    results = {}
    try:
        for label, (method, path, body) in cases.items():
            for _ in range(5):  # warm up
                call(method, path, body)
            runs = [call(method, path, body) for _ in range(repeats)]
            times = [r[0] for r in runs]
            results[label] = {
                "status": runs[0][1],
                "bytes": runs[0][2],
                "p50_ms": round(statistics.median(times), 2),
                "p95_ms": round(percentile(times, 95), 2),
                "p99_ms": round(percentile(times, 99), 2),
            }
    finally:
        connection.close()
    return results


def measure(mode: str) -> dict:
    port = free_port()
    env = {
        **os.environ,
        "PROFILE_APP_MODE": mode,
        "PROFILE_RATE_LIMIT_ENABLED": "false",
        "PROFILE_REQUEST_LOG": "false",
    }
    if mode == "local":
        env["PROFILE_TIER1_ARTIFACT_DIR"] = "artifacts/tier1"
    started = time.perf_counter()
    server = subprocess.Popen(  # noqa: S603
        [sys.executable, "-m", "uvicorn", "profile_api.main:app", "--port", str(port), "--no-server-header", "--no-access-log"],
        cwd=BACKEND, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )  # fmt: skip
    try:
        while True:
            try:
                probe = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
                probe.request("GET", "/api/v1/health")
                probe.getresponse().read()
                probe.close()
                break
            except OSError:
                time.sleep(0.2)
        startup = time.perf_counter() - started
        before = rss_mb(server.pid)
        results = run_cases("127.0.0.1", port, include_classifier=(mode == "local"))
        return {
            "mode": mode,
            "startup_seconds": round(startup, 1),
            "memory_mb_after_start": round(before, 0),
            "memory_mb_after_load": round(rss_mb(server.pid), 0),
            "requests_per_endpoint": 200,
            "endpoints": results,
        }
    finally:
        server.terminate()
        server.wait(timeout=30)


def print_report(label: str, data: dict) -> None:
    print(f"\n{label}")
    for name, r in data["endpoints"].items():
        print(
            f"  {name:<44} {r['status']}  p50 {r['p50_ms']:>6} ms  p95 {r['p95_ms']:>6} ms  p99 {r['p99_ms']:>6} ms  {r['bytes']:>7} B"
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", help="measure an already running server instead of starting one")
    parser.add_argument(
        "--classifier", action="store_true", help="with --url: also measure the classifier endpoints (local mode)"
    )
    parser.add_argument("--out", type=Path, help="with --url: where to write the JSON")
    args = parser.parse_args()
    if args.url:
        parsed = urlparse(args.url)
        report = {"url": args.url, "endpoints": run_cases(parsed.hostname, parsed.port or 80, args.classifier)}
        if args.out:
            args.out.write_text(json.dumps(report, indent=2) + "\n")
        print_report(args.url, report)
    else:
        full = {"public": measure("public")}
        if (BACKEND / "artifacts" / "tier1" / "manifest.json").exists():
            full["local"] = measure("local")
        REPORT.write_text(json.dumps(full, indent=2) + "\n")
        for mode, data in full.items():
            print(
                f"\n{mode}: start {data['startup_seconds']} s, memory {data['memory_mb_after_start']:.0f} to {data['memory_mb_after_load']:.0f} MB"
            )
            print_report(mode, data)

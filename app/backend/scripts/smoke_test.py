"""Check a running deployment from the outside, using only fictional input. Standard library only.

Usage:  python smoke_test.py https://staging.example.org [--local-mode]

It sends nothing private: one fictional sentence, and requests for the fixed examples. It checks that the site and the
API answer, that the security headers are present, that the things that must be off are off, and that the findings and
search behave. Exit code 0 means every check passed. Use it after every deployment and after every rollback.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

FICTIONAL = "I spend weekends in second hand bookshops, drink too much tea, and write poems in a notebook."
results: list[tuple[bool, str]] = []


def check(ok: bool, message: str) -> None:
    results.append((bool(ok), message))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("base_url")
    parser.add_argument("--local-mode", action="store_true", help="expect local mode (classifier endpoints answer)")
    parser.add_argument(
        "--header",
        action="append",
        default=[],
        help="extra request header, for example 'Authorization: Bearer ...' for a private host",
    )
    parser.add_argument("--no-proxy", action="store_true", help="ignore proxy settings (for localhost)")
    args = parser.parse_args()
    base = args.base_url.rstrip("/")
    extra = dict(h.split(": ", 1) for h in args.header)  # never printed
    opener = urllib.request.build_opener(*([urllib.request.ProxyHandler({})] if args.no_proxy else []))

    def call(path, data=None, method=None):
        body = json.dumps(data).encode() if data is not None else None
        request = urllib.request.Request(  # noqa: S310
            base + path,
            data=body,
            method=method,
            headers={"Content-Type": "application/json", "Accept": "*/*", **extra},
        )  # noqa: S310
        try:
            response = opener.open(request, timeout=30)  # noqa: S310
        except urllib.error.HTTPError as error:
            response = error
        raw = response.read()
        try:
            parsed = json.loads(raw)
        except ValueError:
            parsed = None
        return response.status, {k.lower(): v for k, v in response.headers.items()}, parsed, raw

    status, headers, health, _ = call("/api/v1/health")
    check(status == 200 and health and health["status"] == "ok", "health answers")
    mode = health["mode"] if health else "?"
    check(
        mode == ("local" if args.local_mode else "public"),
        f"mode is {'local' if args.local_mode else 'public'} (reported: {mode})",
    )
    check(
        headers.get("content-security-policy", "").startswith("default-src 'none'"),
        "API content security policy is strict",
    )
    check(
        headers.get("x-content-type-options") == "nosniff" and headers.get("referrer-policy") == "no-referrer",
        "API security headers present",
    )
    check("x-request-id" in headers, "answers carry a request id")
    check("server" not in headers or "uvicorn" not in headers["server"].lower(), "no server banner")
    if base.startswith("https://"):
        check("strict-transport-security" in headers, "HSTS is sent over https")

    status, headers, meta, _ = call("/api/v1/meta")
    check(
        status == 200 and meta["features"]["discovery"] and meta["features"]["lab_summary"],
        "discovery and lab findings are loaded",
    )
    if not args.local_mode:
        check(meta["features"]["classifier_demo"] is False, "classifier is off in public mode")
    check("ratelimit-limit" in headers, "rate limit headers present")

    for path in ("/api/docs", "/api/redoc", "/api/openapi.json", "/openapi.json"):
        if not args.local_mode:
            check(call(path)[0] == 404, f"{path} is not served")
    status, _, body, _ = call("/api/v1/classify/examples")
    check(status == (200 if args.local_mode else 403), f"classifier examples answer {status}")

    status, _, lab, _ = call("/api/v1/lab/summary")
    check(
        status == 200 and lab["models"]["test"]["final"]["macro_f1"] == 0.386,
        "lab summary holds the validated test macro F1 0.386",
    )

    status, _, found, _ = call("/api/v1/discover/similar", {"text": FICTIONAL, "method": "both", "k": 5})
    both = status == 200 and [r["method"] for r in found["results"]] == ["embeddings", "tfidf"]
    check(
        both and all(len(r["neighbours"]) == 5 for r in found["results"]),
        "a fictional search returns five neighbours per method",
    )
    check(
        both
        and found["pool"]["synthetic"] is True
        and all("text" not in n for r in found["results"] for n in r["neighbours"]),
        "results are synthetic and carry no profile text",
    )
    status, _, error, raw = call("/api/v1/discover/similar", {"text": "zz-smoke-marker", "extra": "zz-smoke-marker"})
    check(status == 422 and b"zz-smoke-marker" not in raw, "a bad request is refused without echoing it")

    status, headers, _, raw = call("/")
    check(status == 200 and b'<div id="root">' in raw, "the web application is served at /")
    check(
        "script-src 'self'" in headers.get("content-security-policy", ""),
        "web application content security policy is set",
    )
    status, _, _, raw = call("/lab/models")
    check(status == 200 and b'<div id="root">' in raw, "a deep link opens the web application")
    check(
        call("/api/v1/nothing")[0] == 404 and call("/api/v1/nothing")[2] is not None,
        "an unknown API path is a JSON 404",
    )

    for ok, message in results:
        print(f"{'ok  ' if ok else 'FAIL'}  {message}")
    failed = [m for ok, m in results if not ok]
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

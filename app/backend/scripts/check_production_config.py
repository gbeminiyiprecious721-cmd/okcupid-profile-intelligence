"""Check that the current settings are safe for a public deployment. Exits with 1 if any check fails.

Run from app/backend, with the same environment variables the deployment will use:
    PROFILE_APP_MODE=public PROFILE_ALLOWED_ORIGINS='["https://your.site"]' .venv/bin/python scripts/check_production_config.py

It reads settings, builds the application in memory and asks it questions. It starts no server, loads no classifier
and reads no profile data.
"""

import subprocess
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from profile_api.config import AppMode, Settings  # noqa: E402
from profile_api.paths import REPO_DIR  # noqa: E402

results: list[tuple[bool, str]] = []
skipped: list[str] = []


def check(ok: bool, message: str) -> None:
    results.append((bool(ok), message))


def main() -> int:
    try:
        settings = Settings()
    except ValueError as error:
        print(f"FAIL  the settings are not valid for this mode: {str(error).splitlines()[0]}")
        return 1

    from profile_api.main import create_app  # imported here: importing it builds the app, which needs valid settings

    check(settings.app_mode is AppMode.PUBLIC, "PROFILE_APP_MODE is public")
    check(settings.tier1_artifact_dir is None, "PROFILE_TIER1_ARTIFACT_DIR is not set")
    check(settings.rate_limit_enabled, "rate limiting is on")
    check(
        settings.rate_limit_search_per_minute <= 60, f"search limit is {settings.rate_limit_search_per_minute} a minute"
    )
    check(
        all(
            o.startswith("https://") or o.startswith(("http://localhost", "http://127.0.0.1"))
            for o in settings.allowed_origins
        ),
        "allowed origins are https (or localhost)",
    )
    check("*" not in settings.allowed_origins, "no wildcard origin")
    production_origins = [o for o in settings.allowed_origins if o.startswith("https://")]
    check(bool(production_origins), "at least one https origin is allowed (the site that will call the API)")

    try:
        git = subprocess.run(  # noqa: S603
            ["git", "ls-files", "--cached", "--others", "--exclude-standard"],  # noqa: S607
            cwd=REPO_DIR, capture_output=True, text=True, check=False,
        )  # fmt: skip
    except FileNotFoundError:  # a container image has no git
        git = subprocess.CompletedProcess([], returncode=127, stdout="", stderr="git is not installed")
    if git.returncode == 0:
        risky = [
            f
            for f in git.stdout.splitlines()
            if "artifacts/tier1" in f or f.endswith((".joblib", "profiles.csv", "classifier_meta.json"))
        ]
        check(not risky, "the deployable file set holds no tier 1 file, model file or data file")
    else:
        skipped.append(
            "deployable file set (not a git checkout: scripts/make_deploy_bundle.py enforces it when the bundle is built)"
        )

    with TestClient(create_app(settings)) as client:
        for path in ("/api/docs", "/api/redoc", "/api/openapi.json", "/openapi.json"):
            check(client.get(path).status_code == 404, f"{path} is not served")
        meta = client.get("/api/v1/meta").json()
        check(
            meta["mode"] == "public" and not meta["features"]["classifier_demo"],
            "the API reports public mode, classifier off",
        )
        check(client.get("/api/v1/classify/examples").status_code == 403, "classifier endpoints refuse")
        health = client.get("/api/v1/health")
        check("strict-transport-security" in health.headers, "HSTS is sent")
        check(
            health.headers.get("content-security-policy", "").startswith("default-src 'none'"),
            "the API content security policy is strict",
        )
        check(health.headers.get("x-content-type-options") == "nosniff", "nosniff is sent")
        check(
            meta["features"]["discovery"] and meta["features"]["lab_summary"],
            "discovery and the lab findings are loaded",
        )

    for ok, message in results:
        print(f"{'ok  ' if ok else 'FAIL'}  {message}")
    failed = [m for ok, m in results if not ok]
    for note in skipped:
        print(f"skip  {note}")
    print(f"\n{len(results) - len(failed)} of {len(results)} checks passed")
    if settings.trust_proxy:
        print("note: PROFILE_TRUST_PROXY is on. Only correct if a proxy you control sets X-Forwarded-For.")
    print(
        "reminder: run uvicorn with --no-server-header --no-access-log, and send the web app's headers (npm run headers)."
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())

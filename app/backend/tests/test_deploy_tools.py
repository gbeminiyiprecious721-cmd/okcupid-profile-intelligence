"""The bundle builder refuses private files, and the smoke test checks a real running server."""

import hashlib
import json
import os
import socket
import subprocess
import sys
import time
import urllib.request

import pytest

from profile_api.paths import APP_DIR, BACKEND_DIR, REPO_DIR

SCRIPTS = BACKEND_DIR / "scripts"
sys.path.insert(0, str(SCRIPTS))
import make_deploy_bundle as bundle  # noqa: E402


# ------------------------------------------------------------------ the bundle builder, on a small pretend repository
def pretend_repo(tmp_path):
    root = tmp_path / "repo"
    files = {
        "app/backend/profile_api/__init__.py": "",
        "app/backend/profile_api/main.py": "print('app')",
        "app/backend/requirements.txt": "fastapi==0.163.0\n",
        "app/backend/scripts/build_search_index.py": "# build",
        "app/backend/scripts/download_model.py": "# download",
        "app/backend/scripts/check_production_config.py": "# check",
        "app/content/synthetic/profiles.json": '{"pool": []}',
        "app/content/synthetic/spec/theme_bank.json": '{"themes": {}}',
        "app/content/lab/lab_summary.json": '{"lab": 1}',
        "app/content/lab/lab_summary.sha256": "x",
        "app/content/lab/figures/a.png": "png",
        "app/frontend/dist/index.html": "<div id=root></div>",
        "app/frontend/dist/assets/app.js": "1",
        "app/deploy/Dockerfile": "FROM python",
        "app/deploy/.dockerignore": "*",
        "app/deploy/security_headers_reference.txt": "x",
        # private things that must never be bundled
        "profiles.csv": "age,essay0\n30,my private essay\n",
        "app/backend/artifacts/tier1/classifier.joblib": "private model",
        "app/backend/artifacts/tier1/classifier_meta.json": '{"private": "meta"}',
        "app/backend/artifacts/embeddings.npy": "index",
        "app/content/classifier/fictional_inputs.json": '{"personas": {}}',
        "okcupid_profile_intelligence.ipynb": "{}",
        "app/backend/.venv/lib/x.py": "venv",
        "app/frontend/node_modules/x/index.js": "dep",
        "app/backend/tests/test_x.py": "test",
        "app/planning/notes.md": "notes",
        ".env": "SECRET=1",
    }
    for name, text in files.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    return root


def build(root, tmp_path):
    return bundle.build(root, tmp_path / "out")


def test_only_the_allowlist_is_copied_and_every_private_file_is_left_out(tmp_path):
    root = pretend_repo(tmp_path)
    result = build(root, tmp_path)
    out = tmp_path / "out"
    names = {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()}
    assert "backend/profile_api/main.py" in names and "frontend/dist/index.html" in names
    assert "Dockerfile" in names and ".dockerignore" in names and "BUNDLE_MANIFEST.json" in names
    for private in (
        "profiles.csv",
        "classifier.joblib",
        "classifier_meta.json",
        "embeddings.npy",
        "fictional_inputs.json",
        ".env",
    ):
        assert not any(n.endswith(private) for n in names), private
    assert not any(
        "venv" in n or "node_modules" in n or "tests" in n or "planning" in n or n.endswith(".ipynb") for n in names
    )
    assert result["files"] == len(names)


def test_a_new_file_is_not_bundled_until_someone_allows_it(tmp_path):
    root = pretend_repo(tmp_path)
    (root / "app/backend/new_module.py").write_text("print('new')")
    (root / "app/content/synthetic/extra.json").write_text("{}")
    build(root, tmp_path)
    names = {p.name for p in (tmp_path / "out").rglob("*")}
    assert "new_module.py" not in names and "extra.json" not in names


def test_a_manifest_lists_every_file_with_its_hash(tmp_path):
    root = pretend_repo(tmp_path)
    build(root, tmp_path)
    manifest = json.loads((tmp_path / "out" / "BUNDLE_MANIFEST.json").read_text())["files"]
    entry = manifest["backend/profile_api/main.py"]
    assert entry["sha256"] == hashlib.sha256(b"print('app')").hexdigest() and entry["bytes"] == len("print('app')")


@pytest.mark.parametrize(
    ("path", "problem"),
    [
        ("app/backend/profile_api/oops.joblib", "data, model or notebook"),
        ("app/backend/profile_api/oops.csv", "data, model or notebook"),
        ("app/backend/profile_api/.env.local", "private file name"),
        ("app/backend/profile_api/tier1/x.py", "forbidden folder"),
        ("app/backend/profile_api/artifacts/x.py", "forbidden folder"),
    ],
)
def test_a_private_kind_of_file_inside_an_allowed_folder_stops_the_build(tmp_path, path, problem):
    root = pretend_repo(tmp_path)
    (root / path).parent.mkdir(parents=True, exist_ok=True)
    (root / path).write_text("x")
    with pytest.raises(bundle.BundleError, match=problem):
        build(root, tmp_path)
    assert not (tmp_path / "out").exists()


def test_a_renamed_copy_of_the_data_or_the_model_is_caught_by_its_hash(tmp_path):
    root = pretend_repo(tmp_path)
    (root / "app/content/synthetic/spec/theme_bank.json").write_text((root / "profiles.csv").read_text())
    with pytest.raises(bundle.BundleError, match="identical to the private file profiles.csv"):
        build(root, tmp_path)
    root = pretend_repo(tmp_path / "second")
    (root / "app/backend/profile_api/looks_harmless.py").write_text("private model")
    with pytest.raises(
        bundle.BundleError, match="identical to the private file app/backend/artifacts/tier1/classifier.joblib"
    ):
        build(root, tmp_path / "second")


@pytest.mark.parametrize(
    ("text", "label"),
    [
        ("path = '/Users/someone/project/data.csv'", "local absolute path"),
        ("-----BEGIN RSA PRIVATE KEY-----", "private key"),
        ("token = 'hf_" + "a" * 34 + "'", "Hugging Face token"),
        ("key = 'AKIA" + "A" * 16 + "'", "cloud access key"),
        ("password = 'correct-horse-battery-staple'", "generic secret"),
    ],
)
def test_a_secret_or_local_path_in_a_bundled_file_stops_the_build(tmp_path, text, label):
    root = pretend_repo(tmp_path)
    (root / "app/backend/profile_api/main.py").write_text(text)
    with pytest.raises(bundle.BundleError, match=label):
        build(root, tmp_path)


def test_an_oversized_bundle_stops_the_build(tmp_path, monkeypatch):
    root = pretend_repo(tmp_path)
    monkeypatch.setattr(bundle, "MAX_MEGABYTES", 0)
    with pytest.raises(bundle.BundleError, match="over the 0 MB limit"):
        build(root, tmp_path)


def test_an_unbuilt_web_application_stops_the_build(tmp_path):
    root = pretend_repo(tmp_path)
    (root / "app/frontend/dist/index.html").unlink()
    with pytest.raises(bundle.BundleError, match="not built"):
        build(root, tmp_path)


def test_the_real_repository_builds_a_clean_bundle_without_its_private_files(tmp_path):
    if not (APP_DIR / "frontend" / "dist" / "index.html").exists():
        pytest.skip("web application not built")
    result = bundle.build(REPO_DIR, tmp_path / "real")
    out = tmp_path / "real"
    names = {p.relative_to(out).as_posix() for p in out.rglob("*") if p.is_file()}
    assert "backend/profile_api/main.py" in names and "content/synthetic/profiles.json" in names
    assert not [
        n
        for n in names
        if n.endswith((".csv", ".joblib", ".npy", ".npz", ".ipynb")) or "tier1" in n or "classifier/" in n
    ]
    assert result["bytes"] < 40 * 1024 * 1024
    # Nothing in the real bundle equals any private file on this computer
    private = bundle.private_hashes(REPO_DIR)
    assert all(bundle.sha256(p) not in private for p in out.rglob("*") if p.is_file())


def test_the_real_bundle_holds_every_file_the_application_reads_at_run_time(tmp_path):
    """A first real run from the bundle found answer_model.json missing. This keeps that from happening again."""
    if not (APP_DIR / "frontend" / "dist" / "index.html").exists():
        pytest.skip("web application not built")
    out = tmp_path / "real"
    bundle.build(REPO_DIR, out)
    for needed in (
        "content/synthetic/profiles.json",
        "content/synthetic/spec/theme_bank.json",
        "content/synthetic/spec/answer_model.json",
        "content/lab/lab_summary.json",
        "content/lab/lab_summary.sha256",
        "backend/requirements.txt",
        "frontend/dist/index.html",
    ):
        assert (out / needed).is_file(), needed
    # The application imports, builds, loads the lab findings and serves its web page using only the bundle.
    code = f"""
from fastapi.testclient import TestClient
from profile_api.config import Settings
from profile_api.main import create_app
from profile_api.services.lab_data import load_lab
import profile_api.paths as p
assert str(p.CONTENT_DIR).startswith({str(out)!r}), p.CONTENT_DIR
assert load_lab() is not None
app = create_app(Settings(_env_file=None, app_mode='public', static_dir={str(out / "frontend" / "dist")!r}))
with TestClient(app) as c:
    assert c.get('/lab/models').status_code == 200
    assert c.get('/api/v1/lab/summary').status_code == 200
print('bundle ok')
"""
    result = subprocess.run(  # noqa: S603
        [sys.executable, "-c", code], cwd=out / "backend", capture_output=True, text=True, timeout=120,
        env={**os.environ, "PYTHONPATH": str(out / "backend")},
    )  # fmt: skip
    assert "bundle ok" in result.stdout, result.stderr[-800:]


def test_the_real_allowlist_names_no_private_path():
    for pattern in bundle.ALLOWLIST:
        assert not any(
            part in pattern
            for part in ("tier1", "artifacts", "profiles.csv", ".ipynb", "classifier", "node_modules", ".venv")
        )


# ------------------------------------------------------------------ the smoke test, against a real running server
def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def serve(mode, static_dir, port):
    env = {
        **os.environ,
        "PROFILE_APP_MODE": mode,
        "PROFILE_STATIC_DIR": str(static_dir),
        "PROFILE_REQUEST_LOG": "true",
        "PROFILE_RATE_LIMIT_ENABLED": "true",
    }
    if mode == "local":
        env["PROFILE_TIER1_ARTIFACT_DIR"] = str(BACKEND_DIR / "artifacts" / "tier1")
    server = subprocess.Popen(  # noqa: S603
        [sys.executable, "-m", "uvicorn", "profile_api.main:app", "--port", str(port), "--no-server-header", "--no-access-log"],
        cwd=BACKEND_DIR, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )  # fmt: skip
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for _ in range(120):
        try:
            opener.open(f"http://127.0.0.1:{port}/api/v1/health", timeout=1)  # noqa: S310
            return server
        except OSError:
            time.sleep(0.5)
    server.terminate()
    pytest.fail("the server did not start")


def run_smoke(port, *extra):
    return subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPTS / "smoke_test.py"), f"http://127.0.0.1:{port}", "--no-proxy", *extra],
        capture_output=True, text=True, timeout=120,
    )  # fmt: skip


@pytest.fixture
def site(tmp_path):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text('<!doctype html><div id="root"></div>')
    return dist


def test_the_smoke_test_passes_against_a_public_mode_server(site):
    port = free_port()
    server = serve("public", site, port)
    try:
        result = run_smoke(port)
    finally:
        server.terminate()
        server.wait(timeout=20)
    assert result.returncode == 0, result.stdout
    assert "FAIL" not in result.stdout and "checks passed" in result.stdout


def test_the_smoke_test_fails_when_the_wrong_mode_is_expected(site):
    port = free_port()
    server = serve("public", site, port)
    try:
        result = run_smoke(port, "--local-mode")
    finally:
        server.terminate()
        server.wait(timeout=20)
    assert result.returncode == 1 and "FAIL" in result.stdout


@pytest.mark.skipif(
    not (BACKEND_DIR / "artifacts" / "tier1" / "manifest.json").exists(), reason="exported classifier not present"
)
def test_the_smoke_test_passes_against_a_local_mode_server(site):
    port = free_port()
    server = serve("local", site, port)
    try:
        result = run_smoke(port, "--local-mode")
    finally:
        server.terminate()
        server.wait(timeout=20)
    assert result.returncode == 0, result.stdout


# ------------------------------------------------------------------ the log summary
def run_summary(lines, *args):
    return subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPTS / "summarise_logs.py"), *args],
        input="\n".join(lines),
        capture_output=True,
        text=True,
        timeout=30,
    )


def request_line(route="/api/v1/health", status=200, ms=3.0):
    return json.dumps(
        {"event": "request", "id": "x", "method": "GET", "route": route, "status": status, "ms": ms, "bytes": 10}
    )


def test_the_log_summary_reports_counts_errors_and_latency_and_ignores_other_lines():
    lines = ["INFO: Application startup complete.", "Loading weights: 100%"] + [request_line(ms=5.0) for _ in range(95)]
    lines += [request_line("/api/v1/discover/similar", 200, 12.0) for _ in range(4)] + [
        request_line("/api/v1/discover/similar", 500, 40.0)
    ]
    result = run_summary(lines)
    report = json.loads(result.stdout)
    assert result.returncode == 0 and report["requests"] == 100 and report["status_counts"] == {"200": 99, "500": 1}
    assert report["routes"]["/api/v1/discover/similar"]["errors_5xx"] == 1


def test_the_log_summary_raises_an_alert_over_a_threshold():
    lines = [request_line(status=500) for _ in range(5)] + [request_line() for _ in range(95)]
    result = run_summary(lines, "--max-5xx-rate", "0.02")
    assert result.returncode == 1 and "ALERT" in result.stderr
    slow = run_summary([request_line(ms=900.0) for _ in range(10)], "--max-p95-ms", "500")
    assert slow.returncode == 1 and "p95" in slow.stderr


def test_the_log_summary_says_so_when_there_is_nothing_to_summarise():
    assert run_summary(["nothing useful"]).returncode == 2


def test_the_log_summary_prints_only_what_is_in_the_request_lines():
    result = run_summary([request_line(), "zz-visitor-marker some stray line"])
    assert "zz-visitor-marker" not in result.stdout + result.stderr


# ------------------------------------------------------------------ the image scanner
def tar_of(files: dict[str, bytes]) -> bytes:
    import io
    import tarfile

    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w") as tar:
        for name, data in files.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def scan(files, repo):
    return subprocess.run(  # noqa: S603
        [sys.executable, str(SCRIPTS / "scan_image_export.py"), "--repo", str(repo)],
        input=tar_of(files), capture_output=True, timeout=60,
    )  # fmt: skip


def clean_image(manifest_files):
    manifest = {"files": {p: {"sha256": hashlib.sha256(d).hexdigest()} for p, d in manifest_files.items()}}
    image = {f"app/{p}": d for p, d in manifest_files.items()}
    image["app/BUNDLE_MANIFEST.json"] = json.dumps(manifest).encode()
    return image


def test_the_image_scanner_passes_a_clean_image_and_files_a_third_party_token_separately(tmp_path):
    files = clean_image({"backend/profile_api/main.py": b"print(1)", "content/a.json": b"{}"})
    files["opt/artifacts/embeddings.npy"] = b"x"
    files["opt/venv/lib/transformers/testing_utils.py"] = b'TOKEN = "hf_' + b"a" * 34 + b'"'
    result = scan(files, tmp_path)
    report = json.loads(result.stdout)
    assert result.returncode == 0 and report["findings"] == [] and report["third_party_notes_total"] == 1
    assert report["application_files_matching_the_bundle"] == 2


def test_the_image_scanner_finds_private_files_by_name_by_hash_and_by_content(tmp_path):
    (tmp_path / "profiles.csv").write_bytes(b"age,essay0\n30,private essay\n")
    (tmp_path / "app" / "backend" / "artifacts" / "tier1").mkdir(parents=True)
    (tmp_path / "app" / "backend" / "artifacts" / "tier1" / "classifier.joblib").write_bytes(b"private model bytes")
    files = clean_image({"backend/profile_api/main.py": b"print(1)"})
    files["app/content/renamed.json"] = b"age,essay0\n30,private essay\n"  # a renamed copy of the data
    files["app/backend/looks_harmless.py"] = b"private model bytes"  # a renamed copy of the model
    files["app/content/profiles.csv"] = b"x"
    files["app/backend/.env"] = b"SECRET=1"
    files["app/backend/leak.py"] = b"path = '/Users/someone/project/'\n-----BEGIN RSA PRIVATE KEY-----"
    files["opt/artifacts/classifier.joblib"] = b"x"
    result = scan(files, tmp_path)
    text = result.stdout.decode()
    assert result.returncode == 1
    for expected in (
        "identical to the private file profiles.csv",
        "identical to the private file classifier.joblib",
        "a private file name",
        "an environment file",
        "a local absolute path",
        "private key block",
        "in the image but not in the bundle",
    ):
        assert expected in text, expected


def test_the_image_scanner_notices_an_application_file_that_differs_from_the_bundle(tmp_path):
    files = clean_image({"backend/profile_api/main.py": b"print(1)"})
    files["app/backend/profile_api/main.py"] = b"print('changed')"
    result = scan(files, tmp_path)
    assert result.returncode == 1 and b"differs from the bundle manifest" in result.stdout

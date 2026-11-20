"""Scan the file system of a container image for anything private. Reads a tar stream from `docker export`.

Usage:
    docker create --name pi-scan IMAGE && docker export pi-scan | python scripts/scan_image_export.py --repo ../.. ; docker rm pi-scan

It checks, for every file in the image:
1. Names: no profiles data, notebook, classifier or Tier 1 file, no environment file, no git folder, no ssh key, cloud
   credential or token file anywhere.
2. Content: the SHA 256 of every file is compared with the SHA 256 of every private file in the repository (the real
   profiles data and every Tier 1 file), so a renamed copy is found too.
3. Secrets: our own files (/app and /opt/artifacts) are searched for local absolute paths, private keys and tokens. Third
   party libraries are searched for private keys and tokens only, and anything found there is reported separately.
4. Our own files must be exactly the bundle: every file under /app must be listed in BUNDLE_MANIFEST.json with the same hash.
Counts and file names are printed. File contents are never printed. Exit code 1 if anything private is found.
"""

import argparse
import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path

FORBIDDEN_NAMES = {
    "profiles.csv",
    "classifier.joblib",
    "classifier_meta.json",
    "id_rsa",
    "id_ed25519",
    ".netrc",
    ".npmrc",
    ".pypirc",
}
FORBIDDEN_PARTS = {"tier1", ".git", ".ssh", ".aws", ".env"}
ALLOWED_OPT_ARTIFACTS = {"embeddings.npy", "tfidf_matrix.npz", "tfidf_vectorizer.joblib", "manifest.json"}
OURS = ("app/", "opt/artifacts/")
KEY = re.compile(rb"-----BEGIN [A-Z ]*PRIVATE KEY-----")
TOKENS = {
    "a Hugging Face token": re.compile(rb"\bhf_[A-Za-z0-9]{30,}\b"),
    "a cloud access key": re.compile(rb"\b(AKIA|ASIA)[A-Z0-9]{16}\b"),
}
LOCAL_PATH = re.compile(rb"/Users/[A-Za-z0-9._-]+/|C:\\\\Users\\\\")
TEXT_SUFFIXES = {
    ".py",
    ".json",
    ".txt",
    ".md",
    ".html",
    ".js",
    ".css",
    ".svg",
    ".cfg",
    ".toml",
    ".pem",
    ".yml",
    ".yaml",
    ".sha256",
    "",
}


def private_hashes(repo: Path) -> dict[str, str]:
    found = {}
    for path in [repo / "profiles.csv", *sorted((repo / "app" / "backend" / "artifacts" / "tier1").glob("*"))]:
        if path.is_file():
            found[hashlib.sha256(path.read_bytes()).hexdigest()] = path.name
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo", type=Path, required=True, help="the repository, to read the private files' hashes from"
    )
    args = parser.parse_args()
    private = private_hashes(args.repo)
    findings: list[str] = []
    third_party: list[str] = []
    files = 0
    ours_files: dict[str, str] = {}
    manifest = None
    with tarfile.open(fileobj=sys.stdin.buffer, mode="r|") as tar:
        for member in tar:
            if not member.isfile():
                continue
            files += 1
            name = member.name.lstrip("./")
            parts = set(Path(name).parts)
            base = Path(name).name
            data = tar.extractfile(member).read()
            digest = hashlib.sha256(data).hexdigest()
            in_ours = name.startswith(OURS)
            if base in FORBIDDEN_NAMES:
                findings.append(f"{name}: a private file name")
            if (parts & FORBIDDEN_PARTS) and in_ours:
                findings.append(f"{name}: inside a forbidden folder")
            if name.endswith(".ipynb"):
                findings.append(f"{name}: a notebook")
            if in_ours and base.startswith(".env"):
                findings.append(f"{name}: an environment file")
            if digest in private:
                findings.append(f"{name}: identical to the private file {private[digest]}")
            if name.startswith("opt/artifacts/") and base not in ALLOWED_OPT_ARTIFACTS:
                findings.append(f"{name}: not one of the Tier 0 search files")
            if name.startswith("app/") and base.endswith((".csv", ".joblib", ".npy", ".npz", ".pkl")):
                findings.append(f"{name}: a data or model file inside the application folder")
            if in_ours:
                ours_files[name] = digest
                if name == "app/BUNDLE_MANIFEST.json":
                    manifest = json.loads(data)
            if Path(name).suffix.lower() in TEXT_SUFFIXES and len(data) < 3_000_000:
                bucket = findings if in_ours else third_party
                if KEY.search(data):
                    bucket.append(f"{name}: contains a private key block")
                for label, pattern in TOKENS.items():
                    if pattern.search(data):
                        bucket.append(f"{name}: contains {label}")
                if in_ours and LOCAL_PATH.search(data):
                    findings.append(f"{name}: contains a local absolute path")

    # Our files must equal the bundle exactly
    bundled = 0
    if manifest is None:
        findings.append("app/BUNDLE_MANIFEST.json is missing: the image cannot be traced to a bundle")
    else:
        # Only backend, content and frontend are copied into the image. The Dockerfile and its ignore file are build
        # inputs at the bundle root, so they are in the manifest but not in the image.
        expected = {
            f"app/{path}": info["sha256"]
            for path, info in manifest["files"].items()
            if path.startswith(("backend/", "content/", "frontend/"))
        }
        for path, digest in expected.items():
            if ours_files.get(path) != digest:
                findings.append(f"{path}: differs from the bundle manifest or is missing")
        # Allowed extras: the manifest itself and the byte compiled caches Python may write (none expected, read only)
        extras = [
            p for p in ours_files if p.startswith("app/") and p not in expected and p != "app/BUNDLE_MANIFEST.json"
        ]
        findings.extend(f"{p}: in the image but not in the bundle" for p in extras)
        bundled = len(expected)

    print(json.dumps({
        "files_in_image": files,
        "private_hashes_checked": len(private),
        "application_files_matching_the_bundle": bundled,
        "findings": findings,
        "third_party_notes": third_party[:20],
        "third_party_notes_total": len(third_party),
    }, indent=2))  # fmt: skip
    return 1 if findings else 0


if __name__ == "__main__":
    raise SystemExit(main())

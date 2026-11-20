"""Assemble the folder a deployment is built from, and refuse if anything private could be in it.

Run from app/backend:  .venv/bin/python scripts/make_deploy_bundle.py [--out ../deploy/build/bundle]

How it keeps private files out:
1. ALLOWLIST. Only the paths listed below are copied. Everything else, including every new file, is left out until
   someone adds it here on purpose. There is no "copy the folder and exclude some things".
2. Forbidden kinds. Even an allowlisted path is refused if it is a data file, a model or index file, an environment
   file, a notebook, a virtual environment or a Tier 1 folder.
3. Content check. The SHA 256 of every file in the bundle is compared with the SHA 256 of every private file on this
   computer (the profiles data and every Tier 1 file), so a renamed copy is caught too.
4. Text check. No file may contain a local absolute path, a private key or a token that looks like a secret.
5. Size. A bundle over MAX_MEGABYTES stops the build, because something large (data, a model) probably got in.
The Docker build context is this folder and nothing else, so the image cannot contain what the bundle does not.
The search index and the embedding model are NOT bundled. The image builds them from the synthetic profiles.
"""

import argparse
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]

# Relative to the repository root. Directories end in /** and take every file below them.
ALLOWLIST = [
    "app/backend/profile_api/**",
    "app/backend/requirements.txt",
    "app/backend/scripts/build_search_index.py",
    "app/backend/scripts/download_model.py",
    "app/backend/scripts/check_production_config.py",
    "app/content/synthetic/profiles.json",
    "app/content/synthetic/spec/theme_bank.json",
    "app/content/synthetic/spec/answer_model.json",
    "app/content/lab/lab_summary.json",
    "app/content/lab/lab_summary.sha256",
    "app/content/lab/figures/*.png",
    "app/frontend/dist/**",
    "app/deploy/Dockerfile",
    "app/deploy/.dockerignore",
    "app/deploy/security_headers_reference.txt",
]
# Deliberately not listed: the notebook, profiles.csv, anything under artifacts/, app/content/classifier (the
# classifier is local only), tests, planning documents, node_modules and every virtual environment.

FORBIDDEN_SUFFIXES = {
    ".csv",
    ".joblib",
    ".pkl",
    ".pickle",
    ".npy",
    ".npz",
    ".ipynb",
    ".pt",
    ".pth",
    ".onnx",
    ".db",
    ".sqlite",
}
FORBIDDEN_PARTS = {"tier1", ".venv", "venv", "node_modules", ".git", "__pycache__", "artifacts", ".env", "classifier"}
FORBIDDEN_NAMES = {"profiles.csv", "classifier_meta.json", "classifier.joblib"}
SECRET_PATTERNS = {
    "a local absolute path": re.compile(r"/Users/[A-Za-z0-9._-]+/|/home/[A-Za-z0-9._-]+/|C:\\\\Users\\\\"),
    "a private key": re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"),
    "a Hugging Face token": re.compile(r"\bhf_[A-Za-z0-9]{30,}\b"),
    "a cloud access key": re.compile(r"\b(AKIA|ASIA)[A-Z0-9]{16}\b"),
    "a generic secret": re.compile(
        r"(?i)\b(api[_-]?key|secret|password|token)\b\s*[:=]\s*['\"][A-Za-z0-9/+_-]{16,}['\"]"
    ),
}
TEXT_SUFFIXES = {
    ".py",
    ".json",
    ".txt",
    ".md",
    ".html",
    ".js",
    ".css",
    ".svg",
    ".sha256",
    ".mjs",
    ".toml",
    ".yml",
    ".yaml",
    "",
}
MAX_MEGABYTES = 40


class BundleError(SystemExit):
    pass


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def allowed_files(root: Path) -> list[Path]:
    found: set[Path] = set()
    for pattern in ALLOWLIST:
        # In Python's glob a trailing "**" matches folders only, so "folder/**" is read as "every file below folder".
        for path in root.glob(pattern + "/*" if pattern.endswith("**") else pattern):
            if path.is_file() and not path.is_symlink() and "__pycache__" not in path.parts and path.suffix != ".pyc":
                found.add(path)
    return sorted(found)


def private_hashes(root: Path) -> dict[str, str]:
    """Hashes of files that must never be deployed, wherever a copy turns up."""
    private: dict[str, str] = {}
    for path in [root / "profiles.csv", *sorted((root / "app" / "backend" / "artifacts" / "tier1").glob("*"))]:
        if path.is_file():
            private[sha256(path)] = str(path.relative_to(root))
    return private


def check_file(root: Path, path: Path, private: dict[str, str]) -> list[str]:
    relative = path.relative_to(root)
    problems = []
    if path.suffix.lower() in FORBIDDEN_SUFFIXES:
        problems.append(f"{relative}: a data, model or notebook file ({path.suffix})")
    if path.name in FORBIDDEN_NAMES or path.name.startswith(".env"):
        problems.append(f"{relative}: a private file name")
    if FORBIDDEN_PARTS & set(relative.parts):
        problems.append(
            f"{relative}: inside a forbidden folder ({', '.join(sorted(FORBIDDEN_PARTS & set(relative.parts)))})"
        )
    digest = sha256(path)
    if digest in private:
        problems.append(f"{relative}: identical to the private file {private[digest]}")
    if path.suffix.lower() in TEXT_SUFFIXES and path.stat().st_size < 5_000_000:
        text = path.read_text(errors="ignore")
        for label, pattern in SECRET_PATTERNS.items():
            if pattern.search(text):
                problems.append(f"{relative}: contains {label}")
    return problems


def build(root: Path, out: Path, require_frontend: bool = True) -> dict:
    files = allowed_files(root)
    if require_frontend and not (root / "app" / "frontend" / "dist" / "index.html").exists():
        raise BundleError("The web application is not built. Run `npm run build` in app/frontend first.")
    private = private_hashes(root)
    problems = [p for file in files for p in check_file(root, file, private)]
    total = sum(f.stat().st_size for f in files)
    if total > MAX_MEGABYTES * 1024 * 1024:
        problems.append(f"the bundle is {total / 1e6:.0f} MB, over the {MAX_MEGABYTES} MB limit")
    if not files:
        problems.append("the allowlist matched no files")
    if problems:
        raise BundleError("Refusing to build the bundle:\n  " + "\n  ".join(problems))

    if out.exists():
        shutil.rmtree(out)
    manifest = {}
    for file in files:
        # The Docker context is rooted at the bundle: app/backend becomes backend, and so on.
        relative = file.relative_to(root / "app")
        target = out / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        manifest[relative.as_posix()] = {"sha256": sha256(file), "bytes": file.stat().st_size}
    (out / "BUNDLE_MANIFEST.json").write_text(json.dumps({"files": manifest, "bytes": total}, indent=2) + "\n")
    # The Dockerfile and its ignore file live at the bundle root, which is the build context.
    for name in ("Dockerfile", ".dockerignore"):
        source = out / "deploy" / name
        if source.exists():
            shutil.move(str(source), out / name)
    # Final check on what was actually written.
    written = [p for p in out.rglob("*") if p.is_file()]
    leftover = [p for p in written if p.name != "BUNDLE_MANIFEST.json" and any(c in private for c in [sha256(p)])]
    if leftover:
        shutil.rmtree(out)
        raise BundleError(f"A private file reached the output: {leftover}")
    return {"files": len(written), "bytes": total, "out": str(out)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=REPO)
    parser.add_argument("--out", type=Path, default=REPO / "app" / "deploy" / "build" / "bundle")
    parser.add_argument("--no-frontend", action="store_true", help="for tests: do not require a built web application")
    args = parser.parse_args()
    result = build(args.root, args.out, require_frontend=not args.no_frontend)
    print(f"Bundle written: {result['files']} files, {result['bytes'] / 1e6:.1f} MB, in {result['out']}")


if __name__ == "__main__":
    try:
        main()
    except BundleError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1) from None

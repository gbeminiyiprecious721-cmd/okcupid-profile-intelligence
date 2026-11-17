"""Serve the built web application (app/frontend/dist) from the same process as the API.

One origin means no CORS, no proxy and one set of headers. The API always keeps its own paths under /api, and an
unknown /api path is a JSON 404, never the web page. Any other path that is not a file gets index.html, so a page
opened directly (for example /lab/models) works.
"""

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, PlainTextResponse, Response

IMMUTABLE = "public, max-age=31536000, immutable"  # files in /assets have the hash of their content in the name
REVALIDATE = "no-cache"  # index.html and the small root files: always check, so a new release shows at once


def mount_web(app: FastAPI, static_dir: Path) -> None:
    root = static_dir.resolve()
    index = root / "index.html"
    if not index.is_file():
        raise RuntimeError(f"PROFILE_STATIC_DIR {static_dir} has no index.html. Build the web application first.")

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    def web(path: str, request: Request) -> Response:
        if path == "api" or path.startswith("api/"):
            raise_not_found()
        candidate = (root / path).resolve()
        inside = candidate == root or root in candidate.parents
        if inside and candidate.is_file():
            cache = IMMUTABLE if candidate.parent.name == "assets" else REVALIDATE
            return FileResponse(candidate, headers={"Cache-Control": cache})
        if "." in Path(path).name:  # a missing file such as /assets/old.js is a 404, not the page
            return PlainTextResponse("Not found", status_code=404, headers={"Cache-Control": "no-store"})
        return FileResponse(index, headers={"Cache-Control": REVALIDATE})


def raise_not_found() -> None:
    from profile_api.errors import ApiError

    raise ApiError(404, "not_found", "There is nothing at this address.")

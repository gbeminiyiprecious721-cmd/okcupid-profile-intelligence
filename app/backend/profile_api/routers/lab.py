from typing import Annotated

from fastapi import APIRouter, Path, Request
from fastapi.responses import FileResponse

from profile_api.errors import ApiError
from profile_api.schemas.lab import LabSummary

router = APIRouter(prefix="/api/v1/lab", tags=["lab"])


def _lab(request: Request):
    lab = getattr(request.app.state, "lab", None)
    if lab is None:
        raise ApiError(503, "feature_unavailable", "The lab findings are not available on this server.")
    return lab


@router.get("/summary", response_model=LabSummary)
def summary(request: Request) -> LabSummary:
    """Approved aggregate findings from the notebook. No profile, essay or row level record."""
    return _lab(request).summary


@router.get("/figures/{name}", response_class=FileResponse)
def figure(request: Request, name: Annotated[str, Path(pattern="^[a-z_]{1,40}$")]) -> FileResponse:
    """One of the notebook's own figures, for charts whose numbers exist only as pictures."""
    path = _lab(request).figure_path(name)
    if path is None:
        raise ApiError(404, "not_found", "There is no figure with this name.")
    return FileResponse(path, media_type="image/png", headers={"Cache-Control": "public, max-age=3600"})

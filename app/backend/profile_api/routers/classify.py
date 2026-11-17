from typing import Annotated

from fastapi import APIRouter, Depends, Request

from profile_api.config import AppMode, Settings, get_settings
from profile_api.errors import ApiError
from profile_api.schemas.classify import ClassifyExamplesResponse, PredictRequest, PredictResponse

router = APIRouter(prefix="/api/v1/classify", tags=["classify"])

SettingsDep = Annotated[Settings, Depends(get_settings)]


def _service(request: Request, settings: Settings):
    """The classifier, or a clear refusal. Public mode never reaches the files, whatever is on disk."""
    if settings.app_mode is AppMode.PUBLIC:
        raise ApiError(
            403,
            "local_only",
            "The classification demonstration runs in local mode only. It needs a model made from the real profiles, "
            "and public mode never loads one.",
        )
    service = getattr(request.app.state, "classifier", None)
    if service is None:
        raise ApiError(503, "feature_unavailable", "The classifier files are not present on this computer.")
    return service


@router.get("/examples", response_model=ClassifyExamplesResponse)
def examples(request: Request, settings: SettingsDep) -> dict:
    """The six fictional examples. Nothing else can be classified."""
    return {"examples": _service(request, settings).examples()}


@router.post("/predict", response_model=PredictResponse)
def predict(body: PredictRequest, request: Request, settings: SettingsDep) -> dict:
    """Class probabilities for one fictional example. The request holds an example name and no other input."""
    return _service(request, settings).predict(body.example_id)

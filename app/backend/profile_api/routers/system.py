from typing import Annotated

from fastapi import APIRouter, Depends, Request

from profile_api import __version__
from profile_api.answers import OPTIONS
from profile_api.config import AppMode, Settings, get_settings
from profile_api.schemas.system import Features, HealthResponse, Limits, MetaResponse
from profile_api.security import limits

router = APIRouter(prefix="/api/v1", tags=["system"])

SettingsDep = Annotated[Settings, Depends(get_settings)]

# Features that need files derived from the real profiles. They can only exist in local mode.
LOCAL_ONLY_FEATURES = ["classifier_demo", "segment_assignment"]


def answer_shares(discovery) -> dict[str, dict[str, float]] | None:
    if discovery is None:
        return None
    return {
        field: {value: round(share, 3) for value, share in by_value.items()}
        for field, by_value in discovery.shares.items()
    }


@router.get("/health", response_model=HealthResponse)
def health(settings: SettingsDep) -> HealthResponse:
    return HealthResponse(status="ok", mode=settings.app_mode.value, version=__version__)


@router.get("/meta", response_model=MetaResponse)
def meta(settings: SettingsDep, request: Request) -> MetaResponse:
    local = settings.app_mode is AppMode.LOCAL
    discovery = getattr(request.app.state, "discovery", None)
    # A feature is on only if it exists and its files were loaded. The local only features also need local mode.
    # The classifier demo and segment assignment are not built (Phase 6), so they stay off.
    features = Features(
        discovery=discovery is not None,
        lab_summary=getattr(request.app.state, "lab", None) is not None,
        classifier_demo=local and getattr(request.app.state, "classifier", None) is not None,
        segment_assignment=False and local,
    )
    return MetaResponse(
        mode=settings.app_mode.value,
        version=__version__,
        features=features,
        pool={"size": len(discovery.pool), "version": discovery.pool_version, "synthetic": True} if discovery else None,
        answer_options=OPTIONS,
        # How common each answer is in the synthetic pool. The interface uses it for inverse frequency weighting.
        answer_shares=answer_shares(discovery),
        local_only_features=LOCAL_ONLY_FEATURES,
        limits=Limits(
            max_text_chars=limits.MAX_TEXT_CHARS,
            min_words=limits.MIN_WORDS,
            min_neighbours=limits.MIN_NEIGHBOURS,
            max_neighbours=limits.MAX_NEIGHBOURS,
        ),
        notice="Fictional profiles only. Nothing you type is stored.",
    )

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Request

from profile_api.errors import ApiError
from profile_api.schemas.discovery import (
    ExamplesResponse,
    ProfileDetail,
    SimilarRequest,
    SimilarResponse,
)
from profile_api.services.discovery import DiscoveryService

router = APIRouter(prefix="/api/v1", tags=["discovery"])


def get_service(request: Request) -> DiscoveryService:
    service = getattr(request.app.state, "discovery", None)
    if service is None:
        raise ApiError(
            503,
            "feature_unavailable",
            "Profile discovery is not available because the search files have not been built on this server.",
        )
    return service


Service = Annotated[DiscoveryService, Depends(get_service)]
ProfileId = Annotated[str, Path(pattern=r"^(syn|ex)_[0-9a-f]{8}$")]


@router.get("/examples", response_model=ExamplesResponse)
def examples(service: Service) -> dict:
    """Six invented starter profiles. They are not part of the searchable pool."""
    return {"examples": service.examples()}


@router.post("/discover/similar", response_model=SimilarResponse)
def similar(payload: SimilarRequest, service: Service) -> dict:
    """The most similar profiles in the synthetic pool for a fictional profile description."""
    answers = payload.answers.model_dump(exclude_none=True)
    return service.similar(payload.text, answers, payload.method, payload.k)


@router.get("/discover/profiles/{profile_id}", response_model=ProfileDetail)
def profile(profile_id: ProfileId, service: Service) -> dict:
    """One invented profile in full."""
    return service.detail(profile_id)

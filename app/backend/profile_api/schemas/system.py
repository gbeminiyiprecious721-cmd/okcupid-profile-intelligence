from typing import Literal

from pydantic import BaseModel

from profile_api.schemas.discovery import PoolInfo


class HealthResponse(BaseModel):
    status: Literal["ok"]
    mode: Literal["public", "local"]
    version: str


class Features(BaseModel):
    """Which capabilities exist right now. Each is on only when its files are loaded."""

    discovery: bool
    lab_summary: bool
    classifier_demo: bool
    segment_assignment: bool


class Limits(BaseModel):
    max_text_chars: int
    min_words: int
    min_neighbours: int
    max_neighbours: int


class MetaResponse(BaseModel):
    mode: Literal["public", "local"]
    version: str
    features: Features
    pool: PoolInfo | None = None
    answer_options: dict[str, list[str]]
    answer_shares: dict[str, dict[str, float]] | None = None
    local_only_features: list[str]
    limits: Limits
    notice: str

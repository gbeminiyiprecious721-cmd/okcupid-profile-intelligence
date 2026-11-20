from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, create_model

from profile_api.answers import FIELDS, OPTIONS
from profile_api.security import limits

# One optional field per lifestyle question, each restricted to its allowed answers. Unknown fields are refused.
Answers = create_model(
    "Answers",
    __config__=ConfigDict(extra="forbid"),
    **{name: (Literal[tuple(OPTIONS[name])] | None, None) for name in FIELDS},  # type: ignore[misc]
)

Method = Literal["embeddings", "tfidf", "both"]


class SimilarRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(
        min_length=1,
        max_length=limits.MAX_TEXT_CHARS,
        description="A fictional profile description.",
    )
    answers: Answers = Field(
        default_factory=Answers,
        description="Optional. Used only to explain results, never to rank them.",
    )  # type: ignore[valid-type]
    method: Method = "both"
    k: int = Field(default=limits.DEFAULT_NEIGHBOURS, ge=limits.MIN_NEIGHBOURS, le=limits.MAX_NEIGHBOURS)


class SharedAnswer(BaseModel):
    field: str
    value: str
    share_of_pool: float = Field(description="Share of pool profiles that gave this answer, among those who answered.")


class Neighbour(BaseModel):
    rank: int
    profile_id: str
    display_handle: str
    score: float = Field(description="Cosine similarity for this method only. Do not compare across methods.")
    lifestyle: dict[str, str | None]
    shared_answers: list[SharedAnswer]
    shared_terms: list[str]
    themes: list[str]
    shared_themes: list[str]


class MethodResult(BaseModel):
    method: Literal["embeddings", "tfidf"]
    score_name: str
    neighbours: list[Neighbour]
    note: str | None = None


class Comparison(BaseModel):
    overlap_count: int
    in_both: list[str]
    only_embeddings: list[str]
    only_tfidf: list[str]
    note: str


class PoolInfo(BaseModel):
    size: int
    version: str
    synthetic: Literal[True] = True


class InputSummary(BaseModel):
    characters_received: int
    words_used: int
    personal_details_removed: dict[str, int] = Field(
        description="Counts by kind. The details themselves are never kept."
    )
    themes_detected: list[str]


class SimilarResponse(BaseModel):
    pool: PoolInfo
    input: InputSummary
    results: list[MethodResult]
    comparison: Comparison | None = None
    notice: str


class ProfileDetail(BaseModel):
    profile_id: str
    display_handle: str
    text: str
    themes: list[str]
    lifestyle: dict[str, str | None]
    is_synthetic: Literal[True] = True


class ExamplesResponse(BaseModel):
    examples: list[ProfileDetail]

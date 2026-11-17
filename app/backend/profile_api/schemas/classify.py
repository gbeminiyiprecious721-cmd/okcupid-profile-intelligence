"""Shapes for the educational classification page. A request can only name a fixed fictional example."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Level = Literal["not at all", "rarely", "socially", "often+"]

NOTICE = (
    "Educational and experimental. The inputs are fictional. A probability is a model estimate from patterns in "
    "2011 and 2012 profiles, never a fact about a person."
)


class Persona(BaseModel):
    """The fixed fictional fields that complete the model's inputs. None of them can be edited."""

    age: int
    height: int = Field(description="Inches.")
    languages_count: int
    education_status: str
    income_answered: int
    sex: str = Field(description="Used by the original model. Fixed for each fictional example.")
    location: str = Field(description="Used by the original model. Fixed for each fictional example.")


class ClassifyExample(BaseModel):
    example_id: str
    display_handle: str
    text: str
    lifestyle: dict[str, str | None]
    persona: Persona


class ClassifyExamplesResponse(BaseModel):
    examples: list[ClassifyExample]
    notice: str = NOTICE


class PredictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    example_id: str = Field(pattern=r"^ex_[0-9a-f]{8}$", description="One of the fictional examples.")


class ClassProbability(BaseModel):
    level: Level
    probability: float = Field(ge=0, le=1)
    base_rate: float = Field(description="Share of training users at this level, in percent.")
    is_predicted: bool


class PredictResponse(BaseModel):
    example_id: str
    display_handle: str
    classes: list[ClassProbability]
    predicted: Level
    top_probability: float = Field(ge=0, le=1)
    margin: float = Field(description="Top probability minus the second highest.")
    notice: str = NOTICE

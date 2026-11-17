"""The shape of lab_summary.json. Every model forbids extra fields, so a stray field (for example a text or a row
level record) can never be added to the file and served: loading fails instead."""

from pydantic import BaseModel, ConfigDict


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Provenance(Strict):
    source: str
    notebook_sha256: str
    contents: str
    figures: dict[str, dict[str, str | int]]


class Dataset(Strict):
    profiles: int
    columns: int
    labelled: int
    unlabelled: int
    train: int
    test: int
    segmented: int
    no_text: int
    california: int
    essay_answers_min: int
    essay_answers_max: int
    income_not_given_pct: float
    period: str


class Level(Strict):
    level: str
    count: int
    share_pct: float


class Target(Strict):
    levels: list[Level]
    largest_to_smallest: float


class Scores(Strict):
    accuracy: float
    macro_f1: float


class MissingField(Strict):
    field: str
    missing_pct: float


class Association(Strict):
    factor: str
    measure: str
    effect: float
    low: float
    high: float


class DrugContrast(Strict):
    often_group_pct: float
    often_group_n: int
    never_group_pct: float
    never_group_n: int


class Overview(Strict):
    dataset: Dataset
    target: Target
    baseline_train: Scores
    missing: list[MissingField]
    associations: list[Association]
    drug_contrast: DrugContrast


class LifestyleRatio(Strict):
    answer: str
    ratio: float


class Segment(Strict):
    id: int
    name: str
    users: int
    share_pct: float
    mean_age: float
    male_pct: float
    top_words: list[str]
    over_represented: list[LifestyleRatio]


class Population(Strict):
    mean_age: float
    male_pct: float


class StabilityRow(Strict):
    k: int
    new_seed: float
    new_sample: float


class StabilityPair(Strict):
    new_seed: float
    new_sample: float


class Silhouette(Strict):
    k2: float
    k6_about: float
    k10: float
    maximum: float
    weak_below: float
    clear_above: float


class Reduction(Strict):
    text_components: int
    text_variation_pct: int
    lifestyle_components: int
    lifestyle_variation_pct: int
    text_columns: int
    lifestyle_columns: int


class DrinkingCheck(Strict):
    highest_segment: int
    highest_often_pct: int
    lowest_segment: int
    lowest_often_pct: int
    lowest_rarely_or_never_pct: int
    others_often_low_pct: int
    others_often_high_pct: int


class AssignmentCheck(Strict):
    agreement_pct: float
    users_checked: int


class Segments(Strict):
    items: list[Segment]
    population: Population
    stability: list[StabilityRow]
    stability_k6: StabilityPair
    silhouette: Silhouette
    reduction: Reduction
    drinking_check: DrinkingCheck
    assignment_check: AssignmentCheck


class ValidationRow(Strict):
    model: str
    inputs: str
    validation_macro_f1: float
    fold_spread: float
    training_macro_f1: float
    validation_accuracy: float


class TuningRow(Strict):
    c: float
    validation_macro_f1: float
    fold_spread: float
    training_macro_f1: float


class SegmentEffect(Strict):
    fold_changes: list[float]
    mean_change: float
    fold_spread: float


class DrinkingWords(Strict):
    users_mentioning_pct: float


class ClassScores(Strict):
    level: str
    precision: float
    recall: float
    f1: float
    support: int


class FinalScores(Strict):
    macro_f1: float
    accuracy: float
    validation_macro_f1: float


class Interval(Strict):
    metric: str
    score: float
    low: float
    high: float


class TestResult(Strict):
    users: int
    c: float
    baseline: Scores
    final: FinalScores
    per_class: list[ClassScores]
    macro_precision: float
    macro_recall: float
    intervals: list[Interval]
    often_predicted_socially_pct: int
    not_at_all_predicted_rarely_pct: int


class ConfusionPct(Strict):
    labels: list[str]
    rows: list[list[int]]
    source: str


class Models(Strict):
    validation: list[ValidationRow]
    tuning: list[TuningRow]
    tuning_best_c: float
    segment_effect: SegmentEffect
    drinking_words: DrinkingWords
    test: TestResult
    confusion_pct: ConfusionPct


class AverageSimilarity(Strict):
    tfidf: float
    embeddings: float


class FieldAgreement(Strict):
    field: str
    chance: float
    tfidf: float
    embeddings: float
    tfidf_lift: float
    embeddings_lift: float


class Pair(Strict):
    tfidf: float
    embeddings: float


class InventedDemo(Strict):
    same_meaning: Pair
    different: Pair


class Cost(Strict):
    columns: int
    memory_mb: int
    seconds: int


class Similarity(Strict):
    searchable_users: int
    tfidf_columns: int
    embedding_columns: int
    queries: int
    neighbours: int
    average_similarity: AverageSimilarity
    fields: list[FieldAgreement]
    invented_profile_demo: InventedDemo
    representation_cost: dict[str, Cost]


class Subgroup(Strict):
    kind: str
    group: str
    users: int
    often_share: float
    macro_f1: float


class UniqueShare(Strict):
    unique: int
    of: int
    pct: float


class Privacy(Strict):
    essays_with_web_link: int
    essays_with_handle: int
    essays_with_email: int
    essays_with_phone: int
    unique_on_six_fields: UniqueShare
    unique_on_four_fields: UniqueShare


class Fairness(Strict):
    subgroups: list[Subgroup]
    privacy: Privacy


class LabSummary(Strict):
    schema_version: int
    provenance: Provenance
    overview: Overview
    segments: Segments
    models: Models
    similarity: Similarity
    fairness: Fairness

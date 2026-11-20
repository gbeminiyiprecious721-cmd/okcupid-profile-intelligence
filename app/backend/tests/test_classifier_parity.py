"""The classifier's feature code is the notebook's own. These tests compare the two, so they cannot drift apart."""

import ast

import pytest
from conftest import notebook_cells
from sklearn.base import clone
from sklearn.compose import ColumnTransformer
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from profile_api.ml import classifier_features as app

FUNCTIONS = ["clean_profiles", "group_by_keyword", "add_structured_features", "add_essay_features"]
CONSTANTS = [
    "RANDOM_STATE",
    "TARGET_RAW",
    "TARGET",
    "TEST_SIZE",
    "ESSAY_COLUMNS",
    "TFIDF_MIN_DOCS",
    "TFIDF_MAX_FEATURES",
    "LOGISTIC_MAX_ITER",
    "CLASS_ORDER",
    "DRINKS_LEVELS",
    "HIDDEN_CODES",
    "VALID_RANGES",
    "HTML_COLUMNS",
    "DIET_RULES",
    "EDUCATION_LEVEL_RULES",
    "EDUCATION_STATUS_RULES",
    "NUMERIC_FEATURES",
    "FLAG_FEATURES",
    "CATEGORY_FEATURES",
    "ALL_FEATURES",
    "MIN_LEVEL_SHARE",
]


def nodes() -> list[ast.stmt]:
    return [node for cell in notebook_cells() for node in ast.parse(cell).body]


def strip_docstring_free_dump(node: ast.AST) -> str:
    return ast.dump(node, annotate_fields=False, include_attributes=False)


@pytest.mark.parametrize("name", FUNCTIONS)
def test_function_is_the_notebooks_function(name):
    notebook = next(n for n in nodes() if isinstance(n, ast.FunctionDef) and n.name == name)
    ours = next(
        n for n in ast.parse(open(app.__file__).read()).body if isinstance(n, ast.FunctionDef) and n.name == name
    )
    assert strip_docstring_free_dump(ours) == strip_docstring_free_dump(notebook)


def notebook_constants() -> dict:
    """Constants of the notebook, evaluated from its own assignments, in order."""
    values: dict = {}
    for node in nodes():
        if isinstance(node, ast.Assign) and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            if name in CONSTANTS and name not in values:
                try:
                    values[name] = eval(compile(ast.Expression(node.value), "notebook", "eval"), dict(values))  # noqa: S307
                except Exception:  # noqa: BLE001, S112 a later cell may define it from other names
                    continue
    return values


@pytest.mark.parametrize("name", CONSTANTS)
def test_constant_is_the_notebooks_constant(name):
    expected = notebook_constants()
    assert name in expected, f"{name} not found in the notebook"
    assert getattr(app, name) == expected[name]


def test_the_pipeline_is_the_notebooks_best_pipeline():
    """Build the notebook's preprocessor, make_tfidf and make_logistic from its own source, and compare parameters."""
    wanted_assigns = {"numeric_steps", "category_steps", "preprocessor"}
    picked = [
        n
        for n in nodes()
        if isinstance(n, ast.FunctionDef)
        and n.name in {"make_tfidf", "make_logistic"}
        or isinstance(n, ast.Assign)
        and getattr(n.targets[0], "id", "") in wanted_assigns
    ]  # fmt: skip
    namespace = {
        "Pipeline": Pipeline,
        "SimpleImputer": SimpleImputer,
        "StandardScaler": StandardScaler,
        "OneHotEncoder": OneHotEncoder,
        "ColumnTransformer": ColumnTransformer,
        "TfidfVectorizer": TfidfVectorizer,
        "LogisticRegression": LogisticRegression,
        **{name: getattr(app, name) for name in CONSTANTS},
    }
    exec(compile(ast.Module(body=picked, type_ignores=[]), "notebook", "exec"), namespace)  # noqa: S102

    notebook = Pipeline(
        [
            (
                "inputs",
                ColumnTransformer(
                    [
                        ("structured", clone(namespace["preprocessor"]), app.ALL_FEATURES),
                        ("text", namespace["make_tfidf"](), "clean_text"),
                    ]
                ),
            ),
            ("model", namespace["make_logistic"](1.0)),
        ]
    )
    ours = app.build_pipeline()
    assert repr(ours.get_params(deep=True)) == repr(notebook.get_params(deep=True))

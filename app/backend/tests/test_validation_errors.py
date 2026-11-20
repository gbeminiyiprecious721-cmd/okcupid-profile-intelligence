"""Input validation, empty inputs and one consistent error shape."""

import json

import pytest
from conftest import SAMPLE, similar

from profile_api.security import limits


def assert_error(response, status, code):
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code and body["error"]["message"]
    return body["error"]


def test_empty_text_is_refused(client):
    error = assert_error(similar(client, ""), 422, "invalid_input")
    assert error["details"] == [{"field": "text", "problem": "Write at least one word."}]


@pytest.mark.parametrize("text", ["   ", "\n\t \n", "!!! ??? ... ,,,", "12345 67890", "😀😀😀", "<br><br>"])
def test_text_with_nothing_to_compare_is_refused(client, text):
    assert_error(similar(client, text), 422, "no_usable_text")


@pytest.mark.parametrize("text", ["https://example.com/a", "someone@example.com", "(415) 555-1234", "@somebody"])
def test_text_that_is_only_contact_details_is_refused(client, text):
    assert_error(similar(client, text), 422, "no_usable_text")


@pytest.mark.parametrize("text", ["hello", "hello there", "ok ok"])
def test_text_with_too_few_words_is_refused(client, text):
    error = assert_error(similar(client, text), 422, "text_too_short")
    assert str(limits.MIN_WORDS) in error["message"]


def test_the_minimum_number_of_words_is_accepted(client):
    assert similar(client, "love hiking outdoors").status_code == 200


def test_text_over_the_limit_is_refused(client):
    error = assert_error(similar(client, "word " * 500), 422, "invalid_input")
    assert "2000" in error["details"][0]["problem"]


def test_text_at_the_limit_is_accepted(client):
    assert similar(client, ("hiking " * 300)[: limits.MAX_TEXT_CHARS]).status_code == 200


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"text": None},
        {"text": 123},
        {"text": ["a list"]},
        {"text": SAMPLE, "k": 0},
        {"text": SAMPLE, "k": 11},
        {"text": SAMPLE, "k": "five"},
        {"text": SAMPLE, "k": 2.5},
        {"text": SAMPLE, "method": "magic"},
        {"text": SAMPLE, "extra": 1},
        {"text": SAMPLE, "answers": {"pets": "likes goldfish"}},
        {"text": SAMPLE, "answers": {"orientation": "anything"}},
        {"text": SAMPLE, "answers": {"religion": "x"}},
        {"text": SAMPLE, "answers": "pets"},
    ],
)
def test_invalid_requests_get_the_standard_error(client, payload):
    error = assert_error(client.post("/api/v1/discover/similar", json=payload), 422, "invalid_input")
    assert error["details"]


def test_sensitive_fields_are_not_accepted_as_answers(client):
    for field in ("orientation", "religion", "ethnicity", "sex"):
        response = client.post("/api/v1/discover/similar", json={"text": SAMPLE, "answers": {field: "x"}})
        assert_error(response, 422, "invalid_input")


def test_malformed_json_is_refused(client):
    response = client.post(
        "/api/v1/discover/similar", content=b"{not json", headers={"Content-Type": "application/json"}
    )
    assert_error(response, 422, "invalid_input")


def test_a_non_json_body_is_refused(client):
    response = client.post("/api/v1/discover/similar", content=SAMPLE, headers={"Content-Type": "text/plain"})
    assert_error(response, 422, "invalid_input")


def test_an_oversized_body_is_refused_before_it_is_read(client):
    big = json.dumps({"text": SAMPLE, "padding": "x" * (limits.MAX_REQUEST_BYTES + 10)})
    assert_error(
        client.post("/api/v1/discover/similar", content=big, headers={"Content-Type": "application/json"}),
        413,
        "payload_too_large",
    )


def test_an_oversized_streamed_body_is_refused_too(client):
    def chunks():
        for _ in range(40):
            yield b"x" * 1024

    response = client.post("/api/v1/discover/similar", content=chunks(), headers={"Content-Type": "application/json"})
    assert_error(response, 413, "payload_too_large")


def test_wrong_method_and_unknown_route_use_the_standard_error(client):
    assert_error(client.get("/api/v1/discover/similar"), 405, "method_not_allowed")
    assert_error(client.get("/api/v1/nothing"), 404, "not_found")


def test_unknown_profile_identifiers(client):
    assert_error(client.get("/api/v1/discover/profiles/syn_00000000"), 404, "not_found")
    assert_error(client.get("/api/v1/discover/profiles/not-an-id"), 422, "invalid_input")
    assert_error(client.get("/api/v1/discover/profiles/../../etc/passwd"), 404, "not_found")


def test_odd_but_valid_text_works(client):
    for text in (
        "I enjoy <b>hiking</b> &amp; camping with my dog",
        "Je aime la randonnée et la cuisine avec mon chien",
        "a\x00b hiking\x07 and camping outside",
    ):
        assert similar(client, text).status_code == 200


def test_unexpected_failures_do_not_leak_details(client, service, monkeypatch):
    def boom(*_a, **_k):
        raise RuntimeError("secret internal detail /Users/someone/path")

    monkeypatch.setattr(service.embedder, "encode", boom)
    quiet = type(client)(client.app, raise_server_exceptions=False)
    response = quiet.post("/api/v1/discover/similar", json={"text": SAMPLE})
    error = assert_error(response, 500, "internal_error")
    assert "secret" not in response.text and "/Users" not in response.text and error["message"]

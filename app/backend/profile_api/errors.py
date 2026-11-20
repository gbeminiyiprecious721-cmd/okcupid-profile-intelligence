"""One error shape for the whole API: {"error": {"code": "...", "message": "...", "details": [...]}}.

Nothing the visitor typed is ever echoed back in an error.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from profile_api.security import limits

log = logging.getLogger("profile_api")


class ApiError(Exception):
    def __init__(self, status: int, code: str, message: str, details: list[dict] | None = None):
        super().__init__(message)
        self.status, self.code, self.message, self.details = status, code, message, details


def body(code: str, message: str, details: list[dict] | None = None) -> dict:
    error: dict = {"code": code, "message": message}
    if details:
        error["details"] = details
    return {"error": error}


_FRIENDLY = {
    "string_too_short": "Write at least one word.",
    "string_too_long": f"Text is limited to {limits.MAX_TEXT_CHARS} characters. Shorten it.",
    "missing": "This field is required.",
    "extra_forbidden": "This field is not accepted.",
    "literal_error": "Choose one of the listed options.",
    "greater_than_equal": f"Choose a number from {limits.MIN_NEIGHBOURS} to {limits.MAX_NEIGHBOURS}.",
    "less_than_equal": f"Choose a number from {limits.MIN_NEIGHBOURS} to {limits.MAX_NEIGHBOURS}.",
    "int_parsing": "Give a whole number.",
    "json_invalid": "The request body is not valid JSON.",
    "string_type": "This field must be text.",
    "string_pattern_mismatch": "This identifier is not in the expected form.",
}


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, exc: ApiError):
        return JSONResponse(body(exc.code, exc.message, exc.details), status_code=exc.status)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, exc: RequestValidationError):
        details = [
            {
                "field": ".".join(str(part) for part in err["loc"] if part not in ("body", "query", "path")) or "body",
                "problem": _FRIENDLY.get(err["type"], "This value is not valid."),
            }
            for err in exc.errors()  # err["input"] is deliberately not used
        ]
        return JSONResponse(body("invalid_input", "The request is not valid.", details), status_code=422)

    @app.exception_handler(StarletteHTTPException)
    async def http_error(_: Request, exc: StarletteHTTPException):
        code = {404: "not_found", 405: "method_not_allowed", 413: "payload_too_large"}.get(
            exc.status_code, "http_error"
        )
        message = {
            404: "There is nothing at this address.",
            405: "This method is not allowed here.",
        }.get(exc.status_code, "The request could not be completed.")
        return JSONResponse(body(code, message), status_code=exc.status_code)

    @app.exception_handler(Exception)
    async def unexpected(_: Request, exc: Exception):
        log.error("unexpected error: %s", type(exc).__name__)  # the type only, never request content
        return JSONResponse(body("internal_error", "Something went wrong on the server."), status_code=500)

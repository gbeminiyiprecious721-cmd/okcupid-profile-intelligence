"""One privacy safe log line per request, for uptime, error and latency monitoring.

What a line holds: a random request id, the method, the ROUTE TEMPLATE (for example
/api/v1/discover/profiles/{profile_id}, never the real path), the status code, the time taken in milliseconds and
the size of the answer.

What it never holds: the client address, the query string, any header (including the user agent), any part of the
request body, or the text of any answer. A visitor's input cannot reach the log, because nothing about the request
except its method, matched route and outcome is read.

uvicorn's own access log is switched off in production, because it writes every URL.
"""

import json
import logging
import sys
import time
import uuid

from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger("profile_api.requests")


def configure_logger() -> None:
    """Send the lines to standard output, where every host collects logs. Only once."""
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = True  # the root logger has no handler in production, so there is no duplicate line


def route_label(scope: Scope) -> str:
    route = scope.get("route")
    path = getattr(route, "path", None)
    if path is None:
        return "unmatched"
    return "web" if path == "/{path:path}" else path


class RequestLogMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        configure_logger()

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = time.perf_counter()
        request_id = uuid.uuid4().hex[:12]
        state = {"status": 500, "bytes": 0}

        async def send_wrapper(message: Message) -> None:
            if message["type"] == "http.response.start":
                state["status"] = message["status"]
                message = {**message, "headers": [*message.get("headers", []), (b"x-request-id", request_id.encode())]}
            elif message["type"] == "http.response.body":
                state["bytes"] += len(message.get("body", b""))
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            logger.info(
                json.dumps(
                    {
                        "event": "request",
                        "id": request_id,
                        "method": scope["method"],
                        "route": route_label(scope),
                        "status": state["status"],
                        "ms": round((time.perf_counter() - started) * 1000, 1),
                        "bytes": state["bytes"],
                    },
                    separators=(",", ":"),
                )
            )

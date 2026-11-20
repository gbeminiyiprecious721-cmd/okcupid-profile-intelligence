"""Reject oversized request bodies before they are read into memory, whether or not a length is declared."""

from fastapi import HTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from profile_api.errors import body


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp, max_bytes: int):
        self.app, self.max_bytes = app, max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        declared = dict(scope["headers"]).get(b"content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._reject(send)
            return

        received = 0

        async def limited() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # FastAPI turns other errors while reading the body into 400. An HTTPException passes through as is.
                    raise HTTPException(status_code=413)
            return message

        await self.app(scope, limited, send)

    async def _reject(self, send: Send) -> None:
        import json

        payload = json.dumps(body("payload_too_large", "The request is too large.")).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 413,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(payload)).encode()),
                ],
            }
        )
        await send({"type": "http.response.body", "body": payload})

"""A small in memory rate limiter, applied to every /api request before any work is done.

Design choices, and their limits:
- Sliding window per client address and per bucket. A search costs far more than a page of static answers, so the
  buckets have different limits.
- The state lives in this process. With several worker processes each one counts separately, so the real limit is
  the configured one times the number of workers. A shared store (for example Redis) or the hosting platform's own
  limiter is the right tool for that, and is listed in the production notes.
- Memory is bounded: at most MAX_KEYS clients are tracked, the oldest are dropped first.
- The client address is the socket address. Behind a reverse proxy it is the proxy's, so one address would be
  limited for everyone. Setting PROFILE_TRUST_PROXY=true uses X-Forwarded-For instead: the entry that is
  PROFILE_TRUSTED_PROXY_HOPS places from the right. With one proxy in front (the default, 1) that is the last
  entry, the one the proxy appended. A platform with two proxies in front (for example a load balancer plus a
  front end) needs 2. Only set this when proxies you control are in front, otherwise a visitor could choose their
  own address, and check the real header layout on the platform first (see deploy/security_configuration.md).
- Nothing about the request body is read or stored. Only the address and a count are kept, in memory.
"""

import json
import math
import time
from collections import OrderedDict, deque
from collections.abc import Callable

from starlette.types import ASGIApp, Receive, Scope, Send

WINDOW_SECONDS = 60.0
MAX_KEYS = 10_000

# Requests that run a search or a model. Everything else under /api is a read of fixed data.
SEARCH_ROUTES = {("POST", "/api/v1/discover/similar"), ("POST", "/api/v1/classify/predict")}
EXEMPT_PATHS = {"/api/v1/health"}  # cheap, and used by uptime checks


class SlidingWindow:
    def __init__(self, clock: Callable[[], float] = time.monotonic):
        self.clock = clock
        self.hits: OrderedDict[tuple[str, str], deque[float]] = OrderedDict()

    def check(self, client: str, bucket: str, limit: int) -> tuple[bool, int, float]:
        """Record a request. Returns (allowed, remaining, seconds until a slot frees)."""
        now = self.clock()
        key = (client, bucket)
        window = self.hits.pop(key, None) or deque()
        while window and window[0] <= now - WINDOW_SECONDS:
            window.popleft()
        allowed = len(window) < limit
        if allowed:
            window.append(now)
        self.hits[key] = window  # most recently used goes last
        while len(self.hits) > MAX_KEYS:
            self.hits.popitem(last=False)
        remaining = max(0, limit - len(window))
        retry = 0.0 if allowed or not window else max(0.0, window[0] + WINDOW_SECONDS - now)
        return allowed, remaining, retry


def client_address(scope: Scope, trust_proxy: bool, hops: int = 1) -> str:
    if trust_proxy:
        for name, value in scope.get("headers", []):
            if name == b"x-forwarded-for":
                entries = [e.strip() for e in value.decode("latin-1").split(",") if e.strip()]
                if len(entries) >= hops:
                    return entries[-hops][:64]
                # Fewer entries than proxies: the header is not what we expect, so do not trust any of it.
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimitMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        *,
        search_per_minute: int,
        general_per_minute: int,
        trust_proxy: bool = False,
        trusted_proxy_hops: int = 1,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.app = app
        self.search_limit = search_per_minute
        self.general_limit = general_per_minute
        self.trust_proxy = trust_proxy
        self.hops = trusted_proxy_hops
        self.window = SlidingWindow(clock)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or not path.startswith("/api") or path in EXEMPT_PATHS:
            await self.app(scope, receive, send)
            return
        method = scope["method"]
        searching = (method, path) in SEARCH_ROUTES
        bucket, limit = ("search", self.search_limit) if searching else ("general", self.general_limit)
        client = client_address(scope, self.trust_proxy, self.hops)
        allowed, remaining, retry = self.window.check(client, bucket, limit)
        headers = {"RateLimit-Limit": str(limit), "RateLimit-Remaining": str(remaining)}
        if allowed:

            async def send_with_headers(message):
                if message["type"] == "http.response.start":
                    existing = [(k, v) for k, v in message.get("headers", [])]
                    existing += [(k.lower().encode(), v.encode()) for k, v in headers.items()]
                    message = {**message, "headers": existing}
                await send(message)

            await self.app(scope, receive, send_with_headers)
            return

        seconds = max(1, math.ceil(retry))
        body = json.dumps(
            {"error": {"code": "rate_limited", "message": f"Too many requests. Try again in {seconds} seconds."}}
        ).encode()
        await send(
            {
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(body)).encode()),
                    (b"retry-after", str(seconds).encode()),
                    *[(k.lower().encode(), v.encode()) for k, v in headers.items()],
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

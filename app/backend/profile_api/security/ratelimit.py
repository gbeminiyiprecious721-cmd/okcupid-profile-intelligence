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
- A global safeguard sits on top of the per client limits: at most ``max_inflight_searches`` searches may be in
  progress at once, whoever sends them, and one visitor may have at most ``max_inflight_per_visitor`` of them. The
  service has a fraction of a CPU, and a search costs between about a second and a minute of that depending on its
  length, so a count per minute is the wrong unit. When too many searches are already waiting, a new one is refused
  at once with a short retry time instead of queueing for a minute. It counts only requests the per client limit
  already let through, and a request refused for being busy gives its slot back, so nobody loses quota to the
  safeguard.
"""

import ipaddress
import json
import math
import time
from collections import OrderedDict, deque
from collections.abc import Callable

from starlette.types import ASGIApp, Receive, Scope, Send

WINDOW_SECONDS = 60.0
BUSY_RETRY_SECONDS = 5
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

    def give_back(self, client: str, bucket: str) -> None:
        """Take back the request just recorded by check(), for one that was let through but then not served."""
        window = self.hits.get((client, bucket))
        if window:
            window.pop()


def normalise_address(text: str) -> str | None:
    """A canonical key for one address, or None if the text is not an address.

    An IPv6 visitor normally holds a whole /64, so every address in it counts as one client. Without this, one visitor
    could pick a new address for every request and never reach the limit. An IPv4 address mapped into IPv6 is counted
    as the IPv4 address. A port, as in ``203.0.113.5:4711`` or ``[2001:db8::1]:4711``, is dropped.
    """
    text = text.strip()
    if text.startswith("[") and "]" in text:
        text = text[1 : text.index("]")]
    elif text.count(":") == 1 and "." in text:
        text = text.split(":")[0]
    try:
        ip = ipaddress.ip_address(text)
    except ValueError:
        return None
    if isinstance(ip, ipaddress.IPv6Address):
        if ip.ipv4_mapped is not None:
            return str(ip.ipv4_mapped)
        return f"{ipaddress.ip_network(f'{ip}/64', strict=False).network_address}/64"
    return str(ip)


def client_address(scope: Scope, trust_proxy: bool, hops: int = 1) -> str:
    """The key the limiter counts a request under.

    Behind proxies we control, the client is the entry ``hops`` places from the right of X-Forwarded-For: each proxy
    appends the address it received the request from, so everything to the left of that entry is under the visitor's
    control and is never read. If the header is missing, has fewer entries than there are proxies, or the chosen entry
    is not an address, nothing in it is trusted and the socket address is used (one shared bucket: it fails safe).
    """
    if trust_proxy:
        # A request may carry the header on several lines. They are one list, in order, as a proxy would read them.
        lines = [value.decode("latin-1") for name, value in scope.get("headers", []) if name == b"x-forwarded-for"]
        entries = [e.strip() for line in lines for e in line.split(",") if e.strip()]
        if len(entries) >= hops:
            key = normalise_address(entries[-hops])
            if key is not None:
                return key
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
        max_inflight_searches: int = 0,
        max_inflight_per_visitor: int = 2,
        busy_retry_seconds: int = BUSY_RETRY_SECONDS,
        clock: Callable[[], float] = time.monotonic,
    ):
        self.app = app
        self.search_limit = search_per_minute
        self.general_limit = general_per_minute
        self.trust_proxy = trust_proxy
        self.hops = trusted_proxy_hops
        self.max_inflight = max_inflight_searches  # 0 turns the global safeguard off
        self.busy_retry = busy_retry_seconds
        self.max_per_visitor = max_inflight_per_visitor
        self.inflight = 0
        self.inflight_by_visitor: dict[str, int] = {}
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
        if not allowed:
            await self.refuse(
                send, "rate_limited", "Too many requests. Try again in {} seconds.", max(1, math.ceil(retry)), headers
            )
            return
        counted = searching and self.max_inflight > 0
        if counted:
            reason = None
            if self.inflight >= self.max_inflight:
                reason = "The demo is busy right now. Try again in {} seconds."
            elif self.inflight_by_visitor.get(client, 0) >= self.max_per_visitor:
                reason = "Your other searches are still running. Try again in {} seconds."
            if reason:
                self.window.give_back(client, bucket)  # nothing wrong was done, so this does not use up their quota
                headers["RateLimit-Remaining"] = str(remaining + 1)
                await self.refuse(send, "busy", reason, self.busy_retry, headers)
                return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                existing = [(k, v) for k, v in message.get("headers", [])]
                existing += [(k.lower().encode(), v.encode()) for k, v in headers.items()]
                message = {**message, "headers": existing}
            await send(message)

        if counted:
            self.inflight += 1
            self.inflight_by_visitor[client] = self.inflight_by_visitor.get(client, 0) + 1
        try:
            await self.app(scope, receive, send_with_headers)
        finally:
            if counted:
                self.inflight -= 1
                left = self.inflight_by_visitor[client] - 1
                if left:
                    self.inflight_by_visitor[client] = left
                else:
                    del self.inflight_by_visitor[client]

    async def refuse(self, send: Send, code: str, message: str, seconds: int, headers: dict[str, str]) -> None:
        body = json.dumps({"error": {"code": code, "message": message.format(seconds)}}).encode()
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

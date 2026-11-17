"""Security headers for every API response. The web app has its own policy, see app/frontend/security-headers.mjs."""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from profile_api.security import web_headers

HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}
HSTS = "max-age=31536000; includeSubDomains"  # only meaningful over https, and only sent in public mode
# The interactive documentation (local mode only) loads its page from a CDN, so it needs a looser policy.
DOCS_PATHS = ("/api/docs", "/api/redoc")
DOCS_CSP = (
    "default-src 'none'; script-src 'unsafe-inline' https://cdn.jsdelivr.net; style-src 'unsafe-inline' "
    "https://cdn.jsdelivr.net; img-src data: https://fastapi.tiangolo.com; connect-src 'self'; frame-ancestors 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, hsts: bool = False):
        super().__init__(app)
        self.hsts = hsts

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        # The web application's files get the web policy, everything under /api gets the strict API policy.
        is_api = request.url.path == "/api" or request.url.path.startswith("/api/")
        for name, value in (
            HEADERS if is_api else {**HEADERS, **web_headers.HEADERS, "Cache-Control": "no-store"}
        ).items():
            response.headers.setdefault(name, value)
        if request.url.path.startswith(DOCS_PATHS):
            response.headers["Content-Security-Policy"] = DOCS_CSP
        if self.hsts:
            response.headers.setdefault("Strict-Transport-Security", HSTS)
        return response

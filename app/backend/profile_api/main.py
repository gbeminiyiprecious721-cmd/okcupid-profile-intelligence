import time
from collections.abc import Callable
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from profile_api import __version__
from profile_api.artifacts import load_discovery
from profile_api.config import AppMode, Settings, get_settings
from profile_api.errors import install_error_handlers
from profile_api.routers import classify, discovery, lab, system
from profile_api.security.body_limit import BodyLimitMiddleware
from profile_api.security.headers import SecurityHeadersMiddleware
from profile_api.security.ratelimit import RateLimitMiddleware
from profile_api.security.request_log import RequestLogMiddleware
from profile_api.services.lab_data import load_lab
from profile_api.web import mount_web


def create_app(settings: Settings | None = None, *, clock: Callable[[], float] = time.monotonic) -> FastAPI:
    settings = settings or get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        # The artifacts are loaded once here. Requests never load, fit or train anything.
        app.state.discovery = load_discovery(settings)
        app.state.lab = load_lab()
        # Tier 1 files exist only in local mode. Public mode does not even look for them.
        if settings.app_mode is AppMode.LOCAL and settings.tier1_artifact_dir is not None:
            # imported here: the classifier needs pandas, and public mode (which never loads it) should not pay for it
            from profile_api.services.classifier import load_classifier

            app.state.classifier = load_classifier(settings.tier1_artifact_dir, settings.content_dir)
        yield

    app = FastAPI(
        title="Profile Intelligence API",
        version=__version__,
        # The documentation and the OpenAPI file describe every endpoint, so public mode serves none of them.
        docs_url="/api/docs" if settings.docs_enabled else None,
        redoc_url="/api/redoc" if settings.docs_enabled else None,
        openapi_url="/api/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.state.discovery = None
    app.state.lab = None
    app.state.classifier = None
    app.dependency_overrides[get_settings] = lambda: settings
    install_error_handlers(app)
    app.add_middleware(BodyLimitMiddleware, max_bytes=settings.max_request_bytes)
    if settings.rate_limit_enabled:
        app.add_middleware(
            RateLimitMiddleware,
            search_per_minute=settings.rate_limit_search_per_minute,
            general_per_minute=settings.rate_limit_general_per_minute,
            trust_proxy=settings.trust_proxy,
            trusted_proxy_hops=settings.trusted_proxy_hops,
            max_inflight_searches=settings.rate_limit_max_inflight_searches,
            max_inflight_per_visitor=settings.rate_limit_max_inflight_per_visitor,
            clock=clock,
        )
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.app_mode is AppMode.PUBLIC)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )
    if settings.request_log:
        app.add_middleware(RequestLogMiddleware)  # outermost, so it sees every answer, including refusals
    app.include_router(system.router)
    app.include_router(discovery.router)
    app.include_router(lab.router)
    app.include_router(classify.router)
    if settings.static_dir is not None:
        mount_web(app, settings.static_dir)  # last, so it never shadows an API route
    return app


app = create_app()

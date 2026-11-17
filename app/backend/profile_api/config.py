"""Settings, read from environment variables that start with PROFILE_.

The mode decides which features may exist. Public mode never touches files derived from the real
profiles. Local mode may, when the files are present.
"""

from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from profile_api.paths import BACKEND_DIR, CONTENT_DIR
from profile_api.security import limits


class AppMode(StrEnum):
    PUBLIC = "public"
    LOCAL = "local"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PROFILE_", env_file=".env", extra="ignore")

    app_mode: AppMode = AppMode.PUBLIC  # the safe default
    allowed_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"])
    tier1_artifact_dir: Path | None = None
    artifact_dir: Path = BACKEND_DIR / "artifacts"  # Tier 0 files built from the synthetic pool
    content_dir: Path = CONTENT_DIR
    static_dir: Path | None = None  # the built web application, served by this process when set
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    max_request_bytes: int = limits.MAX_REQUEST_BYTES
    max_concurrent_searches: int = 2
    # None keeps PyTorch's own choice. The vectors are the same at any thread count (a test checks).
    torch_threads: int | None = Field(default=None, ge=1, le=16)
    # Rate limiting, per client address and per minute. See security/ratelimit.py for what it can and cannot do.
    rate_limit_enabled: bool = True
    rate_limit_search_per_minute: int = Field(default=30, ge=1)
    rate_limit_general_per_minute: int = Field(default=240, ge=1)
    request_log: bool = True  # one privacy safe line per request on standard output, see security/request_log.py
    trusted_proxy_hops: int = Field(
        default=1, ge=1, le=5
    )  # proxies in front: the client is this many entries from the right
    trust_proxy: bool = False  # use the last X-Forwarded-For entry. Only behind a proxy you control.

    @model_validator(mode="after")
    def keep_modes_separate(self) -> "Settings":
        if self.app_mode is AppMode.PUBLIC and self.tier1_artifact_dir is not None:
            raise ValueError(
                "PROFILE_TIER1_ARTIFACT_DIR is set but PROFILE_APP_MODE is public. "
                "Public mode must never load files derived from the real profiles."
            )
        if self.app_mode is AppMode.PUBLIC:
            for origin in self.allowed_origins:
                local = origin.startswith(("http://localhost", "http://127.0.0.1"))
                if origin == "*" or not (origin.startswith("https://") or local):
                    raise ValueError(
                        f"Allowed origin {origin!r} is not acceptable in public mode. "
                        "Use https origins, or localhost for development. A wildcard is never allowed."
                    )
        return self

    @property
    def docs_enabled(self) -> bool:
        """The interactive API documentation and the OpenAPI file are served in local mode only."""
        return self.app_mode is AppMode.LOCAL


@lru_cache
def get_settings() -> Settings:
    return Settings()

# syntax=docker/dockerfile:1.7
#
# One container: the API and the built web application, on one origin. Public mode only.
# A general purpose image. The live service uses Dockerfile.render in this folder. The steps were tested in a clean room
# (new virtual environment, empty model cache, files from the bundle only). See operations_and_rollback.md.
#
# Build context = the bundle written by app/backend/scripts/make_deploy_bundle.py, and nothing else:
#     python app/backend/scripts/make_deploy_bundle.py
#     docker build -t profile-intelligence:$(date +%Y%m%d-%H%M) app/deploy/build/bundle
# The bundle holds no data, no notebook, no Tier 1 file and no search index. The image builds the index itself from
# the synthetic profiles, and fetches the embedding model once, at build time. At run time nothing is downloaded.
#
# Pin the base image by digest on the first build (python:3.12-slim-bookworm@sha256:...) and update it on purpose.

# ---------------------------------------------------------------- build stage
FROM python:3.12-slim-bookworm AS build
ENV PIP_NO_CACHE_DIR=1 PIP_DISABLE_PIP_VERSION_CHECK=1 HF_HOME=/opt/hf PROFILE_ARTIFACT_DIR=/opt/artifacts
RUN python -m venv /opt/venv
ENV PATH=/opt/venv/bin:$PATH
COPY backend/requirements.txt /tmp/requirements.txt
# CPU only PyTorch. The default Linux wheel carries about 2 GB of CUDA libraries that this application never uses.
RUN pip install torch==2.15.0 --index-url https://download.pytorch.org/whl/cpu \
 && pip install -r /tmp/requirements.txt \
 && pip uninstall -y pandas
# ^ nothing the public application serves needs pandas (only the local only classifier does); removing it saves memory
COPY backend /app/backend
COPY content /app/content
# Fetch the model at the pinned revision, then build the search index from the synthetic profiles (a few seconds).
RUN python /app/backend/scripts/download_model.py \
 && python /app/backend/scripts/build_search_index.py \
 && chmod -R a+rX /opt/hf /opt/artifacts
# ^ Hugging Face writes a few cache files readable by root only. The application runs as user 1000, so make
#   everything readable. (The image is read only at run time, so nothing needs to be writable.)

# ---------------------------------------------------------------- runtime stage
FROM python:3.12-slim-bookworm
RUN useradd --system --uid 1000 --home-dir /nonexistent --shell /usr/sbin/nologin app
COPY --from=build /opt/venv /opt/venv
COPY --from=build /opt/hf /opt/hf
COPY --from=build /opt/artifacts /opt/artifacts
COPY backend /app/backend
COPY content /app/content
COPY frontend/dist /app/frontend/dist
COPY BUNDLE_MANIFEST.json /app/BUNDLE_MANIFEST.json

# Public mode is the default and the only mode this image runs in. Origins are not needed on one origin.
# The model cache is read only at run time and the network is not used: HF_HUB_OFFLINE stops any lookup.
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 \
    HF_HOME=/opt/hf HF_HUB_OFFLINE=1 TRANSFORMERS_OFFLINE=1 TOKENIZERS_PARALLELISM=false MALLOC_ARENA_MAX=2 \
    PROFILE_APP_MODE=public \
    PROFILE_ARTIFACT_DIR=/opt/artifacts \
    PROFILE_STATIC_DIR=/app/frontend/dist \
    PROFILE_TRUST_PROXY=true \
    PORT=8080
WORKDIR /app/backend
# Hugging Face runs containers as user id 1000, so the same id is used everywhere.
USER 1000
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:%s/api/v1/health' % os.environ['PORT'], timeout=4)"

# One worker: the models are loaded once (about 620 MB), and the rate limiter counts in one place.
# --no-access-log: uvicorn's access log writes every URL. The application writes its own privacy safe line instead.
CMD ["sh", "-c", "exec uvicorn profile_api.main:app --host 0.0.0.0 --port ${PORT} --workers 1 --no-server-header --no-access-log"]

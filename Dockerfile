# Single-container deploy: one image builds the React/Vite SPA, then serves it
# same-origin with the FastAPI API. Build from the repo root:
#
#   docker build \
#     --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_live_xxx \
#     -t job-hunter .
#
# VITE_* values are inlined into the JS bundle at build time, so the Clerk
# publishable key must be passed here — not at `docker run`.

# ---- Stage 1: build the frontend ----
FROM oven/bun:1 AS frontend

WORKDIR /web

ARG VITE_API_URL=/api
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY

COPY frontend/package.json frontend/bun.lock ./
RUN bun install --frozen-lockfile

COPY frontend/ ./
RUN bun run build   # -> /web/build

# ---- Stage 2: Python backend + WeasyPrint + built SPA ----
FROM python:3.12-slim

# WeasyPrint renders PDFs in-process and needs these native libs at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangoft2-1.0-0 \
        libpangocairo-1.0-0 \
        libcairo2 \
        libgdk-pixbuf-2.0-0 \
        libffi8 \
        libharfbuzz0b \
        fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

ENV POETRY_VIRTUALENVS_CREATE=false \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN pip install poetry

# Install deps against the lockfile before copying source for better layer caching.
COPY backend/pyproject.toml backend/poetry.lock ./
RUN poetry install --only main --no-interaction --no-ansi

COPY backend/ ./

# Built SPA from stage 1, served by FastAPI (see app/main.py::_mount_frontend).
COPY --from=frontend /web/build ./frontend_build
ENV FRONTEND_DIST=/app/frontend_build

EXPOSE 8000

# Bind the platform's injected $PORT (Railway/Render set it), falling back to
# 8000 for local `docker run` and docker-compose.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]

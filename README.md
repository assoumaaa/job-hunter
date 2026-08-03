# Job Hunter

Job Hunter is a job search workspace. It fetches openings from LinkedIn, screens
them against your profile with Claude, tailors your CV and cover letter to
each posting, and tracks every application from first fetch to offer.

## How it's built

- **Frontend** (`frontend/`): Vite + React SPA. Tailwind v4 with the Job Hunter
  design tokens (`src/App.css`, guideline in `docs/brand.md`), Geist type,
  light and dark themes, ag-grid for the jobs table, Clerk for auth.
- **Backend** (`backend/`): FastAPI + SQLAlchemy. Claude handles screening,
  generation, and CV parsing; WeasyPrint renders the recruiter-facing PDFs
  in-process (CMU Serif, deliberately separate from the app's visual system);
  Apify powers LinkedIn scraping.

## Run it

```bash
# Frontend dev server + API together (from frontend/)
cd frontend
bun install
bun run dev        # vite on :5173, uvicorn on :8000

# Backend alone (from backend/)
poetry install
poetry run uvicorn app.main:app --reload --port 8000
```

Per-user API keys (Anthropic, Apify) and model choices live in the app's
Settings page, encrypted at rest.

## Deploy

Single-container image: bun builds the SPA, FastAPI serves it with the API
under `/api`. See `docs/deployment/DEPLOY.md`.

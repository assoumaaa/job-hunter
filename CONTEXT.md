# Domain model — job-hunter

The ubiquitous language for the backend (`backend/app`). Names here are the ones
the code uses; keep them in step when the code changes.

## Seams (deep modules)

- **LLM seam** (`services/llm.py`) — the one place the Anthropic SDK is touched.
  Callers cross it via `complete_text` / `complete_json` / `complete_tool`; the
  SDK response shape never escapes. Two adapters: `AnthropicLLM` (production) and
  `FakeLLM` (tests). Owns the model registry (`SCREENING_MODEL`,
  `GENERATION_MODEL`, config-driven), JSON extraction, and retry. Swap the model
  in a test with `llm.use(FakeLLM([...]))`.

- **Job intake** (`services/intake.py`) — the pipeline over `fetch` → `screen` →
  `generate`. Route handlers cross this interface and do nothing else: validate,
  call one function, serialize. Domain preconditions raise `IntakeError` (carries
  the HTTP status the route surfaces). Hides base-CV loading, profile-context
  building, the tailor → fit → persist sequence, and posting-to-`Job` mapping.

- **Résumé document** (`services/resume.py`) — the single shape parse, generate,
  and render all agree on. `SCHEMA_JSON` is the shape shown to the model;
  `Resume` is the typed, tolerant in-process value; `normalize()` returns a
  complete canonical dict (renderers read this instead of guessing with `.get()`);
  `merge_identity()` is the one home for grafting factual identity (header +
  languages) from the base CV onto tailored sections.

- **ATS score** (`services/ats_scorer.py::AtsScore`) — one value from scorer to
  API. It carries the sub-scores, the missing keywords, the notes, and the
  `decision` (APPROVED | NEEDS_REVISION | REJECTED). Everything upstream keeps
  the whole score; `to_api_dict()` is the single projection at the transport
  edge. The route reads `decision`; it does not re-derive accept/reject from a
  threshold of its own.

- **PDF renderer** (`services/pdf_generator.py`) — `fit_and_render` is the deep
  entry: CSS auto-fit (8 tightening steps) then optional LLM trim, converging on
  a one-page PDF. WeasyPrint sits behind the render seam (`use_renderer` /
  `reset_renderer`), so the fit/trim loop is testable without it. The fit loop is
  the single source of truth for "fits on a page."

## Known boundaries (deliberately not unified yet)

- **Identity duplication** — a candidate's name / links / location / languages
  live both as `Profile` columns and inside the CV `header`. `merge_identity`
  centralizes the graft, but the two homes remain; unifying them is a DB +
  frontend change, left for a future decision.
- **ATS breakdown transport** — `Job.atsBreakdown` is still a JSON string
  (`schemas.job.JobOut.atsBreakdown: Optional[str]`), not a typed nested object,
  to keep the existing API/DB contract. The value is whole up to that edge.

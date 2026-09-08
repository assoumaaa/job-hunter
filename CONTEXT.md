# Domain model — job-hunter

The ubiquitous language for the backend (`backend/app`). Names here are the ones
the code uses; keep them in step when the code changes.

## Seams (deep modules)

- **LLM seam** (`services/llm.py`) — the one place the Anthropic SDK is touched.
  Callers cross it via `complete_text` / `complete_json` / `complete_json_array` /
  `complete_tool`; the SDK response shape never escapes. Two adapters:
  `AnthropicLLM` (production) and `FakeLLM` (tests). Owns the model registry
  (`SCREENING_MODEL`, `GENERATION_MODEL`, config-driven), retry, and **all** reply
  parsing — `strip_fences`, `extract_json`, `extract_json_array` (with its salvage
  tiers for a model that drops the array brackets) and `first_object_span`. No
  caller writes its own `json.loads` of a reply.

  `FakeLLM` answers either by **route** (`when(reply, model=…, tool=…, prompt=…)`,
  first match wins) or by positional queue. Route anything that crosses more than
  one module: a pipeline's call order depends on the data, so a queue shifts
  whenever a branch is or isn't taken.

- **Credentials** (`services/credentials.py` + `core/deps.py`) — per-request API
  keys and model choices, resolved user value → `.env` → nothing, and carried on a
  ContextVar. Routes declare `Depends(active_credentials)`; **no handler writes the
  `with` block itself**. The dependency must stay `async`: FastAPI runs sync
  dependencies and sync endpoints in separate threadpool contexts, so a ContextVar
  set in a sync `yield` dependency never reaches the endpoint and its token raises
  on reset.

- **Job intake** (`services/intake.py`) — the pipeline over `fetch` → `screen` →
  `generate`. Hides base-CV loading, profile-context building, the tailor → fit →
  persist sequence, and posting-to-`Job` mapping. `_with_credentials` keeps intake
  callable from tests and scripts without a request.

- **Job query** (`services/job_query.py`) — every read and small write of a user's
  Jobs. Callers pass the signed-in `User`, never a filter, so a query that forgets
  the ownership scope cannot be written. Owns the list's filters, sort columns,
  light-column projection and paging, and `VIEWS` — the single definition of what
  each saved view means, shared by the page query, its total and the stats counts.
  `HEAVY_COLUMNS` names the text blobs a list must never load; a test pins it
  against `schemas.job.JobListItem` so adding a column can't silently ship a blob.

- **Document tweak** (`services/tweak.py`) — one turn of the edit-a-document chat,
  and the reset that undoes it. Owns the snapshot-on-first-edit rule, the
  transcript, and storing the edit **verbatim** (fitting happens at render time;
  re-fitting here made every tweak erode the previous one). `target` is a
  parameter, not a branch: `_SLOTS` describes how each document is stored.

- **Résumé document** (`services/resume.py`) — the single shape parse, generate,
  and render all agree on. `SCHEMA_JSON` is the shape shown to the model;
  `Resume` is the typed, tolerant in-process value; `normalize()` returns a
  complete canonical dict (renderers read this instead of guessing with `.get()`);
  `merge_identity()` is the one home for grafting factual identity (header +
  languages) from the base CV onto tailored sections. It takes the Profile's
  `links` and `languages` as fallbacks for what the CV header leaves blank (the
  CV wins wherever it says something), and it strips spoken languages out of
  generated `skills` — they have one home, the Languages section, so a second
  copy at a different level can't reach the page. Two more structural rules
  live here rather than in a prompt: a generated skill item survives only if
  every word of it appears somewhere in the base CV (after synonym folding,
  so "RESTful APIs" is claimed by "REST APIs" and "GCP" by "Google Cloud
  Platform"), and a role's title may only be its base title or one of its
  declared `alternateTitles` — the CV editor's per-role field that replaced
  the employer-specific retitle rule. `experience_years()` derives tenure from
  the period strings, overlaps counted once, the way a parser does.

- **Skill vocabulary** (`services/vocabulary.py`) — `canonicalize` folds
  synonyms ("React.js"→"react", "Postgres"→"postgresql", "k8s"→"kubernetes",
  "developer"→"engineer") and `tokens` splits significant words. The keyword
  scorer and the skills whitelist both read through it, so they cannot
  disagree about whether two spellings are the same skill, and a CV is never
  pushed to carry both.

- **ATS score** (`services/ats_scorer.py::AtsScore`) — one value from scorer to
  API, composed the way ranking systems actually weigh a CV: keyword coverage
  30 (must-haves saturate at 80% coverage, nice-to-haves at 60%, so stuffing
  the last terms buys nothing), most-recent title vs req title 10
  (`_title_score`, older titles at a discount), requirements 10 (years from
  date ranges 5 + the knockout half 5), format and hygiene 10 (less a point
  per bullet the summary restates — `_summary_repeats`), and the independent
  LLM evaluator 40. Keyword hits go through `_keyword_pattern` over the
  canonical vocabulary, tolerant of plural and hyphen differences per word: a
  matcher that only accepted the JD's literal "APIs integration" taught the
  generator to copy the typo. `check_hard_requirements` is the knockout step
  a real ATS runs on the application form: judged once per job against the
  candidate's facts (never against a pass's wording); any unmet requirement
  zeroes the knockout points, caps the decision below APPROVED and leads the
  gaps. The score carries the sub-scores, the missing keywords, the unmet
  requirements, the notes, and the `decision` (APPROVED | NEEDS_REVISION |
  REJECTED). Everything upstream keeps the whole score; `to_api_dict()` is the
  single projection at the transport edge. `intake` reads `decision`; it does
  not re-derive accept/reject from a threshold of its own.
  `scripts/ats_calibration.py` tabulates score against application outcome —
  the check that tells you when the proxy stops being one.

- **PDF renderer** (`services/pdf_generator.py`) — `fit_and_render` is the deep
  entry: CSS auto-fit (8 tightening steps) then optional LLM trim, converging on
  a one-page PDF. WeasyPrint sits behind the render seam (`use_renderer` /
  `reset_renderer`), so the fit/trim loop is testable without it. The trim loop
  swallows a failed trim but re-raises `IntakeError`: "add your API key" means the
  trim was never possible, and swallowing it returned a silently untrimmed PDF.
  `parse_back_issues` reads the finished PDF back the way an ATS parser does
  and lists the header, role, education and certification facts it cannot
  find; `generate_for_jobs` appends them to the job's gaps, and the renderer
  tests assert a clean read-back on a real render.

## Errors

`IntakeError(message, status_code)` is the one domain error. An app-level handler
in `main.py` maps it to its status, so no route needs to catch it — and a handler
that wraps its body in `except Exception` can no longer downgrade a 422 to a 500.

## Route layer

Handlers validate, call one function, and serialize. Domain logic lives behind
the seams above; the `Out` schemas carry `from_attributes`, so a handler returns
the service's own value rather than copying it field by field.

## Frontend seams

- **Resource modules** (`frontend/src/services/api/*.js`) — `useJobsApi`,
  `useCvApi`, `useProfileApi`. Every network call lives here; pages ask for jobs,
  not for `/jobs?view=…`. Methods resolve to the decoded value, or `undefined`
  when the request failed (the error has already been shown). Memoize on
  `callApi` alone — never on `loading`, which flips mid-request.
- **`useResource`** (`services/useResource.js`) — the fetch lifecycle: first-load
  flag, refetch, and dropping a superseded response.
- **`usePdfPreview`** (`services/usePdfPreview.js`) — the blob object-URL
  lifecycle for a rendered preview.
- **`models/job.js`** — the Job domain as the UI renders it: one ATS scale
  (`atsTone`), the saved `VIEWS`, date and location formatting, and the parsers
  for the JSON-string columns.

## Known boundaries (deliberately not unified yet)

- **Identity duplication** — a candidate's name / links / location / languages
  live both as `Profile` columns and inside the CV `header`. `merge_identity`
  centralizes the graft and `intake.generate_for_jobs` resolves the two once
  (CV first, Profile fills gaps) so the prompt and the rendered page describe
  the same languages, but the two homes remain; unifying them is a DB +
  frontend change, left for a future decision.
- **ATS breakdown transport** — `Job.atsBreakdown` is still a JSON string
  (`schemas.job.JobOut.atsBreakdown: Optional[str]`), not a typed nested object,
  to keep the existing API/DB contract. The value is whole up to that edge.
- **`CV.latexSource`** — a legacy column nothing writes. Kept for rollback only;
  read `structuredData` to decide whether a user has a CV.

"""The llm seam: one interface, two adapters, no network in tests.

These exercise the real service functions (job extraction, screening, JD
analysis, the edit-a-CV chat) with a FakeLLM standing in for Anthropic — proof
that the seam lets us run the pipeline offline without editing any call site.
"""

import anthropic

from app.services import ats_scorer, claude, job_extractor, llm


def test_extract_json_handles_fences_and_prose():
    assert llm.extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert llm.extract_json('here you go: {"a": 1} cheers') == {"a": 1}
    assert llm.extract_json("not json at all") == {}


def test_job_extractor_parses_fake_reply(fake_llm):
    fake_llm(
        [{"title": "Backend Engineer", "company": "Acme", "location": "Berlin",
          "description": "Build APIs."}]
    )
    job = job_extractor._extract_with_claude("<raw page text>")
    assert job["title"] == "Backend Engineer"
    assert job["company"] == "Acme"


def test_screen_jobs_parses_json_array(fake_llm):
    fake = fake_llm(
        ['[{"id":"j1","fit":"good_fit","score":4.5,"reason":"strong","archetype":"backend"}]']
    )
    results = claude.screen_jobs(
        jobs=[{"id": "j1", "title": "Backend Eng", "company": "Acme", "description": "x"}],
        positions=["Backend Engineer"],
        profile={"seniority": "mid"},
    )
    assert results == [
        {"id": "j1", "fit": "good_fit", "score": 4.5, "reason": "strong", "archetype": "backend"}
    ]
    # The call really went through the seam.
    assert len(fake.calls) == 1
    assert fake.calls[0]["model"] == llm.SCREENING_MODEL


def test_analyze_jd_parses_fake_reply(fake_llm):
    fake_llm(
        [{"must_have_keywords": ["Python", "FastAPI"], "nice_to_have_keywords": ["Docker"],
          "required_years": 4, "seniority": "mid", "hard_requirements": [], "role_summary": "Builds services."}]
    )
    analysis = ats_scorer.analyze_jd("We need a Python engineer.")
    assert analysis.must_have_keywords == ["Python", "FastAPI"]
    assert analysis.required_years == 4
    assert analysis.seniority == "mid"


def test_chat_edit_cv_uses_forced_tool(fake_llm):
    # A dict reply becomes the forced-tool input.
    fake_llm(
        [{"message": "Tightened the summary.",
          "updated_cv": {"summary": "Shorter.", "experience": []}}]
    )
    result = claude.chat_edit_cv(
        history=[],
        current_cv={"summary": "Long.", "experience": []},
        base_cv={"summary": "Long.", "experience": []},
        user_prompt="make it shorter",
        job_title="Backend Engineer",
        company="Acme",
    )
    assert result["message"] == "Tightened the summary."
    assert result["updated_cv"] == {"summary": "Shorter.", "experience": []}


def test_transient_error_is_retried():
    """A rate-limit error is retried, then the second attempt succeeds."""

    class FlakyAdapter:
        def __init__(self):
            self.attempts = 0

        def run(self, **kwargs):
            self.attempts += 1
            if self.attempts == 1:
                raise anthropic.APIConnectionError(request=None)
            return llm.LLMResult(text="ok")

    flaky = FlakyAdapter()
    llm.use(flaky)
    # Backoff base is small; monkeypatch sleep to keep the test instant.
    import app.services.llm as llm_mod

    original_sleep = llm_mod.time.sleep
    llm_mod.time.sleep = lambda *_: None
    try:
        text = llm.complete_text(model=llm.SCREENING_MODEL, messages=[{"role": "user", "content": "hi"}])
    finally:
        llm_mod.time.sleep = original_sleep
    assert text == "ok"
    assert flaky.attempts == 2

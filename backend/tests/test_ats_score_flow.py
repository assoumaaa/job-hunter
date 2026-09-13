"""The ATS score is one value from scorer to API — no rename, nothing dropped.

Drives the whole generate -> score loop offline with a staged FakeLLM, then
checks the score survives intact and that the single serialization projection
keeps the score's own field names.
"""

import json

from app.services import ats_scorer, claude


def test_to_api_dict_keeps_score_field_names():
    score = ats_scorer.AtsScore(
        total=90, keyword=45, requirements=4, format=8, semantic=15, impact=13,
        recruiter=5, decision="APPROVED", missing_must_have=["Kafka"],
        missing_nice_to_have=[], gaps=["tighten summary"], notes="solid",
    )
    api = ats_scorer.to_api_dict(score)
    # No rename dance: requirements stays requirements, semantic stays semantic.
    assert api["requirements"] == 4
    assert api["semantic"] == 15
    assert api["decision"] == "APPROVED"
    # Fields the old AtsBreakdown silently dropped now survive.
    assert api["recruiter"] == 5
    assert api["missing_must_have"] == ["Kafka"]
    assert api["notes"] == "solid"


def test_generation_result_score_property():
    assert claude.GenerationResult(resume={}, cover_letter="", pass_num=1).ats_score == 0


def test_full_generate_and_score_runs_offline(fake_llm):
    generation_text = (
        "## KEYWORDS\nPython, FastAPI, Docker\n"
        "## ARCHETYPE\nbackend\n"
        "## RESUME\n"
        + json.dumps(
            {
                "summary": "Backend engineer.",
                "experience": [
                    {
                        "company": "Acme",
                        "title": "Software Engineer",
                        "location": "Berlin",
                        "period": "2020-2024",
                        "bullets": [
                            "Built Python FastAPI services handling 12k req/s",
                            "Shipped Docker deploys cutting release time 40%",
                        ],
                    }
                ],
                "skills": [{"category": "Languages", "items": ["Python"]}],
            }
        )
        + "\n## COVER LETTER\nDear team, I built Python systems.\n"
    )
    fake_llm(
        [
            # 1) analyze_jd
            {
                "must_have_keywords": ["Python", "FastAPI"],
                "nice_to_have_keywords": ["Docker"],
                "required_years": None,
                "seniority": "mid",
                "hard_requirements": [],
                "role_summary": "Builds services.",
            },
            # 2) generate_cv_and_cl (pass 1)
            generation_text,
            # 3) score_resume -> _llm_evaluate
            {"semantic": 15, "impact": 15, "recruiter": 10, "notes": "strong"},
        ]
    )

    result = claude.tailor_cv_iterative(
        base_cv={"header": {"name": "A"}, "experience": []},
        job_description="We need Python and FastAPI.",
        job_title="Backend Engineer",
        company="Acme",
    )

    # The whole score is attached — a real AtsScore, not a lossy breakdown.
    assert isinstance(result.ats, ats_scorer.AtsScore)
    assert result.ats.keyword == 30  # both must-haves + the nice-to-have present (30 = keyword ceiling)
    assert result.ats.decision == "APPROVED"
    assert result.ats_score == result.ats.total

    # Serializing keeps the score's names and its decision.
    api = ats_scorer.to_api_dict(result.ats)
    assert api["requirements"] == result.ats.requirements
    assert api["semantic"] == result.ats.semantic
    # Route status mirrors the score's own decision (no magic threshold).
    assert (result.ats.decision == "REJECTED") is False


# --- grounding gates which pass is kept --------------------------------------
# The cheapest way to raise a keyword score is to invent the keyword. A pass
# that introduces unsupported claims is never kept, however much it scores.

_BASE_CV = {"header": {"name": "A"}, "experience": [{
    "company": "Acme", "title": "Software Engineer",
    "bullets": ["Built Python FastAPI services handling 12k req/s"],
}]}
_GROUNDING = "You audit a tailored resume"


def _generation(summary: str, bullet: str, coverage: str = "") -> str:
    return (
        "## KEYWORDS\nPython\n## ARCHETYPE\nbackend\n"
        + (f"## REQUIREMENT COVERAGE\n{coverage}\n" if coverage else "")
        + "## RESUME\n"
        + json.dumps({
            "summary": summary,
            "experience": [{"company": "Acme", "title": "Software Engineer", "bullets": [bullet]}],
            "skills": [],
        })
        + "\n## COVER LETTER\nDear team.\n"
    )


def _loop_llm(pass_one_violations: list[str]):
    from app.services import llm

    def says(*needles):
        return lambda kwargs: all(n in llm._call_text(kwargs) for n in needles)

    fake = llm.FakeLLM(default="{}")
    fake.when(json.dumps(["Go", "Kafka"]), predicate=says(_GROUNDING, "Fabricated summary."))
    fake.when(json.dumps(pass_one_violations), prompt=_GROUNDING)
    fake.when({
        "must_have_keywords": ["Python", "Go", "Kafka"], "nice_to_have_keywords": [],
        "required_years": None, "seniority": "mid", "hard_requirements": [],
        "role_summary": "Builds services.",
    }, prompt="analyzing a job posting")
    fake.when(
        _generation("Fabricated summary.", "Built Go and Python FastAPI services handling 12k req/s over Kafka"),
        prompt="PREVIOUS RESUME (Pass 1",
    )
    fake.when(
        _generation(
            "Grounded summary.", "Built Python FastAPI services handling 12k req/s",
            coverage="MET: Python services <- Built Python FastAPI services handling 12k req/s\nNOT MET: Go",
        ),
        prompt="professional CV writer",
    )
    fake.when({"semantic": 15, "impact": 15, "recruiter": 10, "notes": "strong"},
              predicate=says("skeptical, time-pressed", "Fabricated summary."))
    fake.when({"semantic": 2, "impact": 2, "recruiter": 2, "notes": "weak"}, prompt="skeptical, time-pressed")
    fake.when({
        "edits": [{"where": "experience[0].bullets[0]", "change": "Mention Go and Kafka", "why": "keywords"}],
        "priority_keywords_to_weave": ["Go", "Kafka"],
    }, prompt="CV editor reviewing")
    return fake


def _tailor(max_passes: int):
    return claude.tailor_cv_iterative(
        base_cv=_BASE_CV, job_description="We need Python, Go and Kafka.",
        job_title="Backend Engineer", company="Acme", max_passes=max_passes,
    )


def test_a_later_pass_that_invents_claims_is_never_kept(caplog):
    import logging

    from app.services import llm

    llm.use(_loop_llm(pass_one_violations=[]))
    with caplog.at_level(logging.WARNING, logger="app.services.claude"):
        result = _tailor(max_passes=2)

    # Pass 2 scored far higher, and it invented Go and Kafka to do it.
    assert result.pass_num == 1
    assert result.resume["summary"] == "Grounded summary."
    assert any("Pass 2 introduced unsupported claims: Go; Kafka" in r.getMessage() for r in caplog.records)


def test_pass_one_claims_are_logged_though_pass_one_is_kept(caplog):
    import logging

    from app.services import llm

    llm.use(_loop_llm(pass_one_violations=["12k req/s"]))
    with caplog.at_level(logging.WARNING, logger="app.services.claude"):
        result = _tailor(max_passes=1)

    assert result.resume["summary"] == "Grounded summary."
    assert any("Pass 1 introduced unsupported claims: 12k req/s" in r.getMessage() for r in caplog.records)


def test_not_met_requirements_are_reported_never_fed_back():
    from app.services import llm

    fake = _loop_llm(pass_one_violations=[])
    llm.use(fake)
    result = _tailor(max_passes=2)

    assert "NOT MET: Go" in result.coverage
    texts = [llm._call_text(c) for c in fake.calls]
    first_generation = next(i for i, t in enumerate(texts) if "professional CV writer" in t)
    later = texts[first_generation + 1 :]
    assert any(_GROUNDING in t for t in later)  # the grounding check did run
    assert not any("NOT MET: Go" in t for t in later)

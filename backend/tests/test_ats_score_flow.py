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

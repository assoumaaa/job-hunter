"""The deterministic half of the ATS score, rebuilt around what ranking
systems actually weigh: recent title vs req title, saturating keyword coverage,
knockout requirements, and a hygiene check the recruiter read depends on.
"""

import json

from app.services import ats_scorer

RESUME = {
    "header": {"name": "Omar", "email": "o@x.com", "phone": "+1"},
    "summary": "Software Engineer with 4 years building ERP and fintech systems. Delivered 500+ modules for 100+ GCC clients.",
    "experience": [
        {"company": "Odoo", "title": "Software Engineer",
         "bullets": ["Engineered 500+ custom modules in Python for 100+ enterprise clients",
                     "Integrated Tabby payment gateway into POS and e-commerce"]},
        {"company": "Meikosoft", "title": "Software Engineer",
         "bullets": ["Built a React dashboard processing $2M+ monthly", "Shipped Docker deploys"]},
    ],
    "skills": [{"category": "Backend", "items": ["Python", "PostgreSQL"]}],
}


def _jd(**kw):
    base = dict(must_have_keywords=[], nice_to_have_keywords=[], required_years=None,
                seniority=None, hard_requirements=[], role_summary="")
    base.update(kw)
    return ats_scorer.JDAnalysis(**base)


# --- title match -----------------------------------------------------------

def test_title_score_rewards_overlap_with_the_most_recent_title():
    assert ats_scorer._title_score(RESUME, "Forward Deployed Software Engineer - UAE") == 5
    assert ats_scorer._title_score(RESUME, "Senior Software Developer") == 10  # seniority ignored, developer ~ engineer
    assert ats_scorer._title_score(RESUME, "Product Manager") == 0
    assert ats_scorer._title_score(RESUME, None) == 0


def test_title_score_counts_an_older_title_at_a_discount():
    retitled = {**RESUME, "experience": [
        {**RESUME["experience"][0], "title": "Technical Solutions Consultant"},
        RESUME["experience"][1],
    ]}
    assert ats_scorer._title_score(retitled, "Software Engineer") == 6


# --- keyword saturation ------------------------------------------------------

def test_keyword_points_saturate_so_stuffing_the_last_terms_does_not_pay():
    # 4 of 5 must-haves present = 80% coverage -> full 24 points already.
    jd = _jd(must_have_keywords=["Python", "PostgreSQL", "React", "Docker", "Kafka"])
    hay = ats_scorer._haystack(ats_scorer._resume_text(RESUME))
    assert ats_scorer._keyword_points(jd.must_have_keywords, hay, 24, 0.8) == 24
    # 2 of 5 -> 40% of the way to the 80% ceiling -> half the points.
    jd = _jd(must_have_keywords=["Python", "PostgreSQL", "Kafka", "Spark", "Scala"])
    assert ats_scorer._keyword_points(jd.must_have_keywords, hay, 24, 0.8) == 12


# --- summary hygiene -------------------------------------------------------

def test_summary_repeating_a_bullet_metric_is_flagged():
    issues = ats_scorer._summary_repeats(RESUME)
    assert len(issues) == 1
    assert "experience[0].bullets[0]" in issues[0]


def test_summary_without_repeats_is_clean():
    clean = {**RESUME, "summary": "Software Engineer bridging ERP delivery and applied AI across the GCC."}
    assert ats_scorer._summary_repeats(clean) == []


# --- hard requirements -----------------------------------------------------

def test_check_hard_requirements_returns_only_the_unmet_ones(fake_llm):
    fake_llm([json.dumps([
        {"requirement": "Fluent Arabic", "status": "met", "evidence": "Languages: Arabic"},
        {"requirement": "US work authorization", "status": "unmet", "evidence": "Based in Dubai, no US status"},
        {"requirement": "5+ years Rust", "status": "unknown", "evidence": ""},
    ])])
    unmet = ats_scorer.check_hard_requirements(
        ["Fluent Arabic", "US work authorization", "5+ years Rust"], "Based in Dubai. Arabic, English."
    )
    assert unmet == ["US work authorization"]


def test_check_hard_requirements_makes_no_call_when_there_are_none(fake_llm):
    fake = fake_llm([])
    assert ats_scorer.check_hard_requirements([], "facts") == []
    assert fake.calls == []


# --- the composed score ----------------------------------------------------

def test_score_composition_and_knockout_cap(fake_llm):
    fake_llm(default={"semantic": 15, "impact": 15, "recruiter": 10, "notes": ""})
    jd = _jd(must_have_keywords=["Python", "PostgreSQL"], nice_to_have_keywords=["Docker"], required_years=3)

    score = ats_scorer.score_resume(RESUME, jd, "jd text", candidate_years=4, job_title="Software Engineer")
    assert (score.keyword, score.title, score.requirements) == (30, 10, 10)
    assert score.format == 9  # 10, minus 1 for the summary restating a bullet metric
    assert score.total == 30 + 10 + 10 + 9 + 15 + 15 + 10
    assert score.decision == "APPROVED"

    capped = ats_scorer.score_resume(
        RESUME, jd, "jd text", candidate_years=4, job_title="Software Engineer",
        unmet_requirements=["US work authorization"],
    )
    assert capped.requirements == 5  # years still count; the knockout half is gone
    assert capped.decision == "NEEDS_REVISION"  # never APPROVED with an unmet knockout
    assert capped.gaps[0] == "Hard requirement not met: US work authorization"
    assert ats_scorer.to_api_dict(capped)["unmet_requirements"] == ["US work authorization"]
    assert ats_scorer.to_api_dict(capped)["title"] == 10

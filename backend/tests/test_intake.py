"""The intake seam: fetch / screen / generate run behind one interface,
testable against an in-memory DB with no network and no HTTP layer.
"""

import pytest

from app.models import Job, Position, User
from app.services import apify, intake


def _user(db, uid="u1"):
    user = User(id=uid, email=f"{uid}@example.com", name="Test")
    db.add(user)
    return user


def test_screen_persists_verdicts_offline(db, fake_llm):
    user = _user(db)
    db.add(Position(userId=user.id, label="Backend Engineer"))
    db.add(
        Job(id="j1", userId=user.id, title="Backend Eng", company="Acme",
            description="Python, FastAPI", relevanceStatus="unscreened")
    )
    db.commit()

    fake_llm(
        ['[{"id":"j1","fit":"good_fit","score":4.6,"reason":"strong match","archetype":"backend"}]']
    )
    outcome = intake.screen(db, user)

    assert (outcome.screened, outcome.good_fit, outcome.maybe, outcome.irrelevant) == (1, 1, 0, 0)
    job = db.query(Job).filter(Job.id == "j1").first()
    assert job.relevanceStatus == "good_fit"
    assert job.screeningScore == "4.6"
    assert job.archetype == "backend"


def test_screen_without_positions_raises_intake_error(db):
    user = _user(db, "u2")
    db.add(Job(id="j2", userId=user.id, title="X", company="Y", relevanceStatus="unscreened"))
    db.commit()

    with pytest.raises(intake.IntakeError) as excinfo:
        intake.screen(db, user)
    assert excinfo.value.status_code == 400


def test_screen_with_nothing_unscreened_is_a_noop(db):
    user = _user(db, "u3")
    db.add(Position(userId=user.id, label="Backend"))
    db.commit()
    outcome = intake.screen(db, user)
    assert outcome.screened == 0


def test_fetch_maps_postings_and_dedups(db, monkeypatch):
    user = _user(db, "u4")
    db.add(Position(userId=user.id, label="Backend"))
    # A job we already have (same normalized URL) must be skipped.
    db.add(Job(id="old", userId=user.id, title="Old", company="C",
               url="https://linkedin.com/jobs/view/111"))
    db.commit()

    postings = [
        apify.ApifyJob(id="1", title="New Role", company="Acme", location="Berlin",
                       description="Build things", url="https://linkedin.com/jobs/view/222?foo=bar",
                       job_type="Full-time"),
        apify.ApifyJob(id="2", title="Dup", company="C", location="",
                       description="x", url="https://www.linkedin.com/jobs/view/111"),
    ]
    monkeypatch.setattr(apify, "fetch_linkedin_jobs", lambda *a, **k: postings)

    outcome = intake.fetch(db, user, "week")
    assert outcome.inserted == 1
    assert outcome.skipped == 1
    inserted = db.query(Job).filter(Job.title == "New Role").first()
    assert inserted.source == "linkedin"
    assert inserted.jobType == "Full-time"  # job_type or seniority_level


def test_resolve_conditional_bullets_drops_non_matching(fake_llm):
    fake_llm(["[true, false]"])  # 1st condition matches the job, 2nd doesn't
    base = {
        "experience": [
            {
                "company": "X",
                "bullets": [
                    "always A",
                    {"text": "devops B", "condition": "if the job involves devops"},
                    {"text": "fintech C", "condition": "if the job is fintech"},
                ],
            }
        ]
    }
    out = intake._resolve_conditional_bullets(base, "DevOps/Kubernetes engineer")
    assert out["experience"][0]["bullets"] == ["always A", "devops B"]


def test_resolve_conditional_bullets_no_conditions_skips_llm(fake_llm):
    # No conditional bullets → no LLM call; the default reply must never be used.
    fake_llm(default="MUST-NOT-BE-USED")
    base = {"experience": [{"bullets": ["a", {"text": "b", "condition": ""}]}]}
    out = intake._resolve_conditional_bullets(base, "any jd")
    assert out["experience"][0]["bullets"] == ["a", "b"]

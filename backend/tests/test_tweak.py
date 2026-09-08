"""One turn of the edit-a-document chat, tested through the module's interface.

These are the rules the route used to carry inline and no test asserted: the
snapshot taken on the first real edit (and only then), the transcript growing by
one exchange a turn, the edit being stored verbatim, and a question leaving the
document alone.
"""

import json

import pytest

from app.models import CV, Job, User
from app.services import llm, tweak
from app.services.errors import IntakeError

CV_DOC = {"summary": "Long.", "experience": []}
EDITED = {"summary": "Shorter.", "experience": []}


@pytest.fixture
def user(db):
    user = User(id="u1", email="o@x.com", name="Omar")
    db.add(user)
    db.add(CV(userId="u1", structuredData=json.dumps(CV_DOC)))
    db.commit()
    return user


@pytest.fixture
def job(db, user):
    job = Job(
        id="j1",
        userId="u1",
        title="Backend Engineer",
        company="Acme",
        description="We need Python.",
        relevanceStatus="good_fit",
        agentStatus="done",
        applicationStatus="new",
        generatedCv=json.dumps(CV_DOC),
        generatedCl="Dear Sir or Madam,",
    )
    db.add(job)
    db.commit()
    return job


def test_edit_snapshots_the_original_once_and_stores_verbatim(db, user, job, fake_llm):
    fake_llm([{"message": "Tightened it.", "updated_cv": EDITED}])

    outcome = tweak.apply(db, user, "j1", "cv", "make it shorter")

    assert outcome.message == "Tightened it."
    assert outcome.hasOriginal is True
    # Stored exactly what the model returned — no re-fit, no trim.
    assert json.loads(outcome.generatedCv) == EDITED
    assert json.loads(job.originalCv) == CV_DOC

    # A second edit must not overwrite the snapshot: reset goes back to the
    # pre-tweak document, not to the previous tweak.
    fake_llm([{"message": "Again.", "updated_cv": {"summary": "Shortest."}}])
    tweak.apply(db, user, "j1", "cv", "shorter still")
    assert json.loads(job.originalCv) == CV_DOC


def test_a_question_leaves_the_document_alone_but_is_recorded(db, user, job, fake_llm):
    fake_llm([{"message": "Did you have direct reports?"}])

    outcome = tweak.apply(db, user, "j1", "cv", "say I managed the team")

    assert json.loads(outcome.generatedCv) == CV_DOC  # unchanged
    assert job.originalCv is None  # nothing to snapshot: no edit happened
    assert outcome.hasOriginal is False
    # The exchange is still part of the transcript.
    assert [t["role"] for t in outcome.history] == ["user", "assistant"]
    assert outcome.history[1]["content"] == "Did you have direct reports?"


def test_transcript_accumulates_across_turns(db, user, job, fake_llm):
    fake_llm([{"message": "One."}])
    tweak.apply(db, user, "j1", "cv", "first")
    fake_llm([{"message": "Two."}])
    outcome = tweak.apply(db, user, "j1", "cv", "second")

    assert [t["content"] for t in outcome.history] == [
        "first",
        "One.",
        "second",
        "Two.",
    ]
    assert json.loads(job.chatCv) == outcome.history


def test_the_two_targets_keep_separate_documents_and_transcripts(
    db, user, job, fake_llm
):
    fake_llm([{"message": "Warmed it.", "updated_cl": "Dear Acme,"}])

    outcome = tweak.apply(db, user, "j1", "cl", "make it warmer")

    assert outcome.generatedCl == "Dear Acme,"  # stored as text, not JSON
    assert job.originalCl == "Dear Sir or Madam,"
    assert job.chatCv is None  # the CV transcript is untouched
    assert json.loads(job.generatedCv) == CV_DOC


def test_reset_restores_both_documents_and_keeps_the_snapshots(
    db, user, job, fake_llm
):
    fake_llm([{"message": "Tightened it.", "updated_cv": EDITED}])
    tweak.apply(db, user, "j1", "cv", "make it shorter")

    outcome = tweak.reset(db, user, "j1")

    assert json.loads(outcome.generatedCv) == CV_DOC
    assert outcome.target == "both"
    # The snapshot survives, so a later round of tweaks can be reset too.
    assert job.originalCv is not None
    assert tweak.reset(db, user, "j1").generatedCv == json.dumps(CV_DOC)


def test_reset_without_a_tweak_is_a_domain_error(db, user, job):
    with pytest.raises(IntakeError) as excinfo:
        tweak.reset(db, user, "j1")
    assert excinfo.value.status_code == 400


@pytest.mark.parametrize(
    "target,prompt,expected",
    [
        ("cover-letter", "anything", "target must be 'cv' or 'cl'"),
        ("cv", "   ", "prompt is empty"),
    ],
)
def test_bad_input_is_rejected_before_any_llm_call(
    db, user, job, target, prompt, expected
):
    fake = llm.FakeLLM()
    llm.use(fake)

    with pytest.raises(IntakeError) as excinfo:
        tweak.apply(db, user, "j1", target, prompt)

    assert excinfo.value.message == expected
    assert fake.calls == []


def test_a_missing_document_is_a_domain_error(db, user, job):
    job.generatedCl = None
    db.commit()

    with pytest.raises(IntakeError) as excinfo:
        tweak.apply(db, user, "j1", "cl", "make it warmer")
    assert excinfo.value.status_code == 400


def test_tweaking_someone_elses_job_is_a_404(db, user, job, fake_llm):
    other = User(id="u2", email="x@x.com", name="Other")
    db.add(other)
    db.add(CV(userId="u2", structuredData=json.dumps(CV_DOC)))
    db.commit()
    fake_llm([{"message": "Tightened it.", "updated_cv": EDITED}])

    with pytest.raises(IntakeError) as excinfo:
        tweak.apply(db, other, "j1", "cv", "make it shorter")
    assert excinfo.value.status_code == 404

"""Job reads live in one module, and every one of them is owner-scoped.

The interface is the test surface: these go through `job_query`, not through
HTTP, so the list's filters, sort, projection and paging are asserted without a
TestClient.
"""

from datetime import datetime, timedelta

import pytest

from app.models import Job, User
from app.schemas.job import JobListItem
from app.services import job_query
from app.services.errors import IntakeError


def _user(db, uid="u1"):
    user = User(id=uid, email=f"{uid}@x.com", name=uid)
    db.add(user)
    db.commit()
    return user


def _job(db, user, jid, **kw):
    defaults = dict(
        title="Backend Engineer",
        company="Acme",
        description="a long description blob",
        relevanceStatus="unscreened",
        agentStatus="pending",
        applicationStatus="new",
        fetchedAt=datetime.utcnow(),
    )
    job = Job(id=jid, userId=user.id, **{**defaults, **kw})
    db.add(job)
    db.commit()
    return job


def test_light_projection_matches_the_list_schema():
    """The one place a column's weight is decided.

    Adding a column to `Job` must either appear on `JobListItem` or be named as
    heavy — otherwise the list would start shipping a text blob, or drop a field
    the table renders.
    """
    columns = {c.name for c in Job.__table__.columns}
    light = columns - job_query.HEAVY_COLUMNS
    schema_fields = set(JobListItem.model_fields) - {
        "hasGeneratedCv",
        "hasGeneratedCl",
    }
    assert light == schema_fields


def test_get_is_scoped_to_the_owner(db):
    mine = _user(db, "u1")
    theirs = _user(db, "u2")
    _job(db, theirs, "j1")

    with pytest.raises(IntakeError) as excinfo:
        job_query.get(db, mine, "j1")
    assert excinfo.value.status_code == 404

    assert job_query.get(db, theirs, "j1").id == "j1"


def test_delete_reports_what_actually_went(db):
    mine = _user(db, "u1")
    theirs = _user(db, "u2")
    _job(db, mine, "j1")
    _job(db, theirs, "j2")

    # Asking to delete two jobs of which you own one deletes one.
    assert job_query.delete(db, mine, ["j1", "j2"]) == 1
    assert job_query.get(db, theirs, "j2").id == "j2"


def test_page_projects_light_columns_and_flags_documents(db):
    user = _user(db)
    _job(db, user, "j1", generatedCv='{"summary": "x"}')

    result = job_query.page(db, user, page_size=10)

    assert result.total == 1
    (row,) = result.items
    assert row["hasGeneratedCv"] is True
    assert row["hasGeneratedCl"] is False
    # The heavy text never left the database.
    assert "description" not in row
    assert "generatedCv" not in row


def test_page_filters_sorts_and_pages(db):
    user = _user(db)
    now = datetime.utcnow()
    _job(db, user, "j1", company="Acme", fetchedAt=now - timedelta(days=2))
    _job(db, user, "j2", company="Beta", fetchedAt=now - timedelta(days=1))
    _job(db, user, "j3", company="Acme Corp", fetchedAt=now)

    assert {r["id"] for r in job_query.page(db, user, company="acme").items} == {
        "j1",
        "j3",
    }

    newest_first = [r["id"] for r in job_query.page(db, user).items]
    assert newest_first == ["j3", "j2", "j1"]

    first_page = job_query.page(db, user, page=1, page_size=2)
    assert [r["id"] for r in first_page.items] == ["j3", "j2"]
    assert first_page.total == 3  # the total ignores paging
    assert [r["id"] for r in job_query.page(db, user, page=2, page_size=2).items] == [
        "j1"
    ]


def test_to_apply_view_means_the_same_thing_in_the_page_and_the_stats(db):
    user = _user(db)
    _job(db, user, "j1", relevanceStatus="good_fit", applicationStatus="new")
    _job(db, user, "j2", relevanceStatus="maybe", applicationStatus="new")
    _job(db, user, "j3", relevanceStatus="good_fit", applicationStatus="applied")
    _job(db, user, "j4", relevanceStatus="irrelevant", applicationStatus="new")

    page = job_query.page(db, user, view="to_apply")
    stats = job_query.stats(db, user)

    assert {r["id"] for r in page.items} == {"j1", "j2"}
    assert page.total == stats.toApply == 2


def test_stats_counts_the_whole_pipeline(db):
    user = _user(db)
    _job(db, user, "j1", relevanceStatus="good_fit", applicationStatus="new", atsScore=80)
    _job(db, user, "j2", applicationStatus="applied", applicationDate=datetime.utcnow())
    _job(db, user, "j3", applicationStatus="interview")
    _job(db, user, "j4", applicationStatus="offer", atsScore=90)

    stats = job_query.stats(db, user)

    assert stats.total == 4
    assert stats.applied == 1
    assert stats.interviews == 1
    assert stats.offers == 1
    assert stats.appliedThisWeek == 1
    assert stats.avgAts == 85  # only the two scored jobs count


def test_stats_are_scoped_to_the_owner(db):
    mine = _user(db, "u1")
    theirs = _user(db, "u2")
    _job(db, theirs, "j1")

    assert job_query.stats(db, mine).total == 0


def test_repair_marks_stuck_generating_jobs_done(db):
    user = _user(db)
    _job(db, user, "j1", agentStatus="generating", generatedCv='{"summary": "x"}')
    _job(db, user, "j2", agentStatus="generating")  # no CV: still genuinely running

    assert job_query.repair_stuck_generating(db, user) == 1
    assert job_query.get(db, user, "j1").agentStatus == "done"
    assert job_query.get(db, user, "j2").agentStatus == "generating"

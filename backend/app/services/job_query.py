"""Every read and small write of a user's Jobs, in one module.

Callers pass the signed-in `User`, never a filter. There is no way to spell a
query here that forgets to scope by owner, because callers no longer spell
queries — before this module the `userId == user.id` condition was hand-written
at ~20 sites and nothing enforced it.

The list view's filters, sort columns, projection and pagination live here too,
so the route is params in, page out. What each saved view *means* ("to apply" =
a good-fit or maybe job you haven't applied to yet) is defined once, in `VIEWS`,
and shared by the page query, its total, and the stats counts.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Job, User
from .errors import IntakeError

# The heavy text columns a list view must never load. Everything else on the
# table is "light" and goes to the jobs list.
#
# `tests/test_job_query.py` asserts this stays in step with `schemas.job
# .JobListItem`, so adding a column to the model can't silently start shipping a
# blob to the list — or silently go missing from it.
HEAVY_COLUMNS = frozenset(
    {
        "description",
        "generatedCv",
        "generatedCl",
        "originalCv",
        "originalCl",
        "chatCv",
        "chatCl",
    }
)

# What each saved view means, as SQL conditions. Defined once; the page query,
# its total, and the stats counts all read from here.
VIEWS: dict[str, list] = {
    "to_apply": [
        Job.relevanceStatus.in_(["good_fit", "maybe"]),
        Job.applicationStatus == "new",
    ],
    "applied": [Job.applicationStatus == "applied"],
    "interview": [Job.applicationStatus == "interview"],
    "rejected": [Job.applicationStatus == "rejected"],
    "no_fit": [Job.relevanceStatus == "irrelevant"],
    "all": [],
}

SORT_COLUMNS = {
    "fetchedAt": Job.fetchedAt,
    "atsScore": Job.atsScore,
    "applicationDate": Job.applicationDate,
    "company": Job.company,
    "title": Job.title,
}


@dataclass(frozen=True)
class JobPageResult:
    """One page of the list, plus the total matching the same filters."""

    items: list[dict]
    total: int


@dataclass(frozen=True)
class JobStatsResult:
    """Aggregate counts across all of a user's jobs."""

    total: int
    toApply: int
    applied: int
    interviews: int
    offers: int
    unscreened: int
    screened: int
    appliedThisWeek: int
    avgAts: int | None


def _owned(user: User) -> list:
    """The ownership scope every query in this module starts from."""
    return [Job.userId == user.id]


def get(db: Session, user: User, job_id: str) -> Job:
    """One job the user owns, heavy columns included, or `IntakeError(404)`."""
    job = db.query(Job).filter(*_owned(user), Job.id == job_id).first()
    if not job:
        raise IntakeError("Job not found", 404)
    return job


def filters(user: User, company: str = "", title: str = "", view: str = "all") -> list:
    """The list's UI filters as SQL conditions, owner scope included."""
    conds = _owned(user)
    if company:
        conds.append(Job.company.ilike(f"%{company}%"))
    if title:
        conds.append(Job.title.ilike(f"%{title}%"))
    # An unknown view is "all": no extra filter.
    conds += VIEWS.get(view, [])
    return conds


def page(
    db: Session,
    user: User,
    *,
    company: str = "",
    title: str = "",
    view: str = "all",
    sort: str = "fetchedAt",
    direction: str = "desc",
    page: int = 1,
    page_size: int = 50,
) -> JobPageResult:
    """One page of the user's jobs: light columns and has-doc flags only."""
    conds = filters(user, company.strip(), title.strip(), view)
    total = db.query(func.count(Job.id)).filter(*conds).scalar() or 0

    sort_col = SORT_COLUMNS.get(sort, Job.fetchedAt)
    order = sort_col.asc() if direction == "asc" else sort_col.desc()

    has_cv = Job.generatedCv.isnot(None).label("hasGeneratedCv")
    has_cl = Job.generatedCl.isnot(None).label("hasGeneratedCl")
    light = [c for c in Job.__table__.columns if c.name not in HEAVY_COLUMNS]

    rows = (
        db.query(*light, has_cv, has_cl)
        .filter(*conds)
        .order_by(order, Job.id.desc())  # id tiebreaker → stable paging
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return JobPageResult(items=[dict(row._mapping) for row in rows], total=total)


def stats(db: Session, user: User) -> JobStatsResult:
    """Counts across ALL of the user's jobs — the list is paginated, so the
    toolbar and dashboard totals come from here, not from a page."""

    def count(*extra) -> int:
        return (
            db.query(func.count(Job.id)).filter(*_owned(user), *extra).scalar() or 0
        )

    avg = (
        db.query(func.avg(Job.atsScore))
        .filter(*_owned(user), Job.atsScore.isnot(None))
        .scalar()
    )
    week_ago = datetime.utcnow() - timedelta(days=7)
    return JobStatsResult(
        total=count(),
        toApply=count(*VIEWS["to_apply"]),
        applied=count(*VIEWS["applied"]),
        interviews=count(*VIEWS["interview"]),
        offers=count(Job.applicationStatus == "offer"),
        unscreened=count(Job.relevanceStatus == "unscreened"),
        screened=count(Job.relevanceStatus != "unscreened"),
        appliedThisWeek=count(
            *VIEWS["applied"], Job.applicationDate >= week_ago
        ),
        avgAts=round(avg) if avg is not None else None,
    )


def update(db: Session, user: User, job_id: str, fields: dict[str, Any]) -> Job:
    """Apply `fields` to one owned job and stamp `updatedAt`."""
    job = get(db, user, job_id)
    for key, value in fields.items():
        setattr(job, key, value)
    job.updatedAt = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return job


def delete(db: Session, user: User, ids: list[str]) -> int:
    """Delete the jobs the user owns among `ids`; return how many really went.

    Returns the row count, not `len(ids)` — asking to delete three jobs of which
    you own one is a deletion of one.
    """
    deleted = (
        db.query(Job)
        .filter(*_owned(user), Job.id.in_(ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return deleted


def repair_stuck_generating(db: Session, user: User) -> int:
    """Mark jobs 'done' that are still flagged generating but already have a CV.

    A self-heal for runs interrupted mid-generation. Called on list load, which
    is why a GET can write; keeping it named makes that explicit rather than a
    surprise at the top of a read handler.
    """
    fixed = (
        db.query(Job)
        .filter(
            *_owned(user),
            Job.agentStatus.in_(["generating", "reviewing"]),
            Job.generatedCv.isnot(None),
        )
        .update({"agentStatus": "done"}, synchronize_session=False)
    )
    if fixed:
        db.commit()
    return fixed


def find_by_url(db: Session, user: User, url: str) -> Job | None:
    """An owned job already at this (normalized) URL, for dedup."""
    return db.query(Job).filter(*_owned(user), Job.url == url).first()


def create(db: Session, user: User, **fields: Any) -> Job:
    """Insert one job owned by `user`, defaulted to the start of the pipeline."""
    job = Job(
        userId=user.id,
        agentStatus=fields.pop("agentStatus", "pending"),
        applicationStatus=fields.pop("applicationStatus", "new"),
        fetchedAt=fields.pop("fetchedAt", None) or datetime.utcnow(),
        **fields,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

"""One turn of the edit-a-document chat, and the reset that undoes it.

The route validates and serializes. Everything about what a tweak *is* lives
here: which stored column the target names, snapshotting the pre-tweak original
so a reset has something to restore, appending to the transcript, and persisting
both. `target` is a parameter, not a branch — the CV and the cover letter differ
only in how their document is stored, which `_SLOTS` describes.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from ..models import Job, User
from . import claude, intake, job_query
from .errors import IntakeError


@dataclass(frozen=True)
class _Slot:
    """Where one target's document, snapshot and transcript are stored."""

    generated: str
    original: str
    chat: str
    missing: str
    load: Callable[[str], object]
    dump: Callable[[object], str]


_SLOTS: dict[str, _Slot] = {
    "cv": _Slot(
        generated="generatedCv",
        original="originalCv",
        chat="chatCv",
        missing="Job has no generated CV yet",
        load=json.loads,
        dump=lambda doc: json.dumps(doc),
    ),
    "cl": _Slot(
        generated="generatedCl",
        original="originalCl",
        chat="chatCl",
        missing="Job has no generated cover letter yet",
        load=lambda stored: stored,
        dump=lambda doc: doc,
    ),
}

TARGETS = tuple(_SLOTS)


@dataclass(frozen=True)
class TweakOutcome:
    """The state of a job's documents after one turn (or after a reset)."""

    target: str
    message: str | None = None
    generatedCv: str | None = None
    generatedCl: str | None = None
    hasOriginal: bool = True
    history: list[dict] = field(default_factory=list)


def _outcome(
    job: Job, *, target: str, message: str | None, history: list[dict] | None
) -> TweakOutcome:
    return TweakOutcome(
        target=target,
        message=message,
        generatedCv=job.generatedCv,
        generatedCl=job.generatedCl,
        hasOriginal=bool(job.originalCv or job.originalCl),
        history=history or [],
    )


def apply(
    db: Session, user: User, job_id: str, target: str, prompt: str
) -> TweakOutcome:
    """Run one chat turn over the job's CV or cover letter and persist the result.

    The assistant may ask a clarifying question instead of editing; then
    `message` carries the question and the document is left untouched. Uses the
    generation model (judgment); does NOT re-run the ATS scoring loop.
    """
    slot = _SLOTS.get(target)
    if slot is None:
        raise IntakeError("target must be 'cv' or 'cl'", 400)

    prompt = (prompt or "").strip()
    if not prompt:
        raise IntakeError("prompt is empty", 400)

    job = job_query.get(db, user, job_id)

    base_cv = intake.load_base_cv(db, user)
    if base_cv is None:
        raise IntakeError("No base CV on file.", 400)

    stored = getattr(job, slot.generated)
    if not stored:
        raise IntakeError(slot.missing, 400)

    history = json.loads(getattr(job, slot.chat) or "[]")

    edit = claude.chat_edit(
        target,
        history,
        slot.load(stored),
        base_cv,
        prompt,
        job_title=job.title,
        company=job.company,
        job_description=job.description or "",
    )

    if edit.document is not None:
        # Snapshot the pre-tweak original once, so a reset can restore it.
        if not getattr(job, slot.original):
            setattr(job, slot.original, stored)
        # Persist the edit verbatim. Re-fitting here trimmed the CV and stored
        # the trimmed copy, so every tweak shrank the previous tweak's output and
        # content could only ever erode. Fitting belongs at render time
        # (POST /cv/compile), which leaves the text intact.
        setattr(job, slot.generated, slot.dump(edit.document))

    history = history + [
        {"role": "user", "content": prompt},
        {"role": "assistant", "content": edit.message},
    ]
    setattr(job, slot.chat, json.dumps(history))

    db.commit()
    db.refresh(job)
    return _outcome(job, target=target, message=edit.message, history=history)


def reset(db: Session, user: User, job_id: str) -> TweakOutcome:
    """Restore both documents from their pre-tweak snapshots.

    The snapshots are kept, so a later round of tweaks can be reset too.
    """
    job = job_query.get(db, user, job_id)

    if not (job.originalCv or job.originalCl):
        raise IntakeError("Nothing to reset — this job has not been tweaked.", 400)

    if job.originalCv:
        job.generatedCv = job.originalCv
    if job.originalCl:
        job.generatedCl = job.originalCl

    db.commit()
    db.refresh(job)
    return _outcome(job, target="both", message=None, history=None)

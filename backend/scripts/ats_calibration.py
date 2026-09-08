"""Does the ATS score predict what happens to an application?

Prints, for the signed-in instance's jobs, the outcome mix per score band and
the score distribution per outcome. Until there are enough interviews the
score is a proxy; this is how you find out when it stops being one.

    cd backend && .venv/bin/python scripts/ats_calibration.py
"""

from __future__ import annotations

import statistics
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app.core.config import settings  # noqa: E402
from app.models import Job  # noqa: E402

BANDS = [(0, 60, "<60"), (60, 70, "60-69"), (70, 80, "70-79"), (80, 90, "80-89"), (90, 101, "90+")]


def band(score: int) -> str:
    return next(label for lo, hi, label in BANDS if lo <= score < hi)


def main() -> None:
    session = sessionmaker(bind=create_engine(settings.DATABASE_URL))()
    rows = (
        session.query(Job.atsScore, Job.applicationStatus)
        .filter(Job.generatedCv.isnot(None), Job.atsScore.isnot(None))
        .all()
    )
    if not rows:
        print("No scored jobs yet.")
        return

    by_status: dict[str, list[int]] = defaultdict(list)
    by_band: dict[str, Counter] = defaultdict(Counter)
    for score, status in rows:
        status = status or "new"
        by_status[status].append(int(score))
        by_band[band(int(score))][status] += 1

    print(f"{len(rows)} scored jobs\n")
    print("Score per outcome")
    print(f"  {'status':<12}{'n':>5}{'mean':>8}{'median':>8}{'min':>6}{'max':>6}")
    for status, scores in sorted(by_status.items(), key=lambda kv: -len(kv[1])):
        print(
            f"  {status:<12}{len(scores):>5}{statistics.mean(scores):>8.1f}"
            f"{statistics.median(scores):>8.1f}{min(scores):>6}{max(scores):>6}"
        )

    statuses = sorted({s for c in by_band.values() for s in c})
    print("\nOutcome mix per score band")
    print("  " + f"{'band':<8}" + "".join(f"{s:>12}" for s in statuses))
    for _, _, label in BANDS:
        counts = by_band.get(label, Counter())
        if counts:
            print("  " + f"{label:<8}" + "".join(f"{counts.get(s, 0):>12}" for s in statuses))

    positive = [s for st in ("interview", "offer") for s in by_status.get(st, [])]
    negative = by_status.get("rejected", [])
    if positive and negative:
        print(
            f"\nInterview/offer mean {statistics.mean(positive):.1f} vs rejected mean "
            f"{statistics.mean(negative):.1f} — a useful score puts the first well above the second."
        )
    else:
        print("\nNot enough interview or rejection outcomes yet to judge the score.")


if __name__ == "__main__":
    main()

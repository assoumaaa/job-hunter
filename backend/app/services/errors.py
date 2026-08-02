"""Domain errors shared across service seams.

`IntakeError` lives here (not in intake.py) so both the intake pipeline and the
credentials seam can raise it without importing each other. The route layer is
the only place that maps `status_code` onto an HTTP response.
"""

from __future__ import annotations


class IntakeError(Exception):
    """A domain precondition failed (no CV, no positions, no API key, ...).

    `status_code` is the HTTP status the route should map this to.
    """

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code

from .auth import router as auth_router
from .jobs import router as jobs_router
from .positions import router as positions_router
from .profile import router as profile_router
from .job_settings import router as job_settings_router
from .cv import router as cv_router

__all__ = [
    "auth_router",
    "jobs_router",
    "positions_router",
    "profile_router",
    "job_settings_router",
    "cv_router",
]

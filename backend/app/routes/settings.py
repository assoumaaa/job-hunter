from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core import crypto
from ..core.auth import get_current_user
from ..core.config import settings
from ..core.db import get_db
from ..models.user import User
from ..models.user_settings import UserSettings
from ..schemas.settings import ModelOption, SettingsOut, SettingsUpdateRequest

router = APIRouter(prefix="/settings", tags=["settings"])

# Curated set of current Claude models offered in the dropdown. The two config
# defaults (haiku screening, sonnet generation) are both in this list, so a
# freshly-loaded Settings page always has a valid selection.
MODEL_OPTIONS = [
    ModelOption(id="claude-opus-4-8", label="Claude Opus 4.8 — most capable"),
    ModelOption(id="claude-sonnet-5", label="Claude Sonnet 5"),
    ModelOption(id="claude-sonnet-4-6", label="Claude Sonnet 4.6"),
    ModelOption(id="claude-haiku-4-5", label="Claude Haiku 4.5 — fastest, cheapest"),
]
_MODEL_IDS = {m.id for m in MODEL_OPTIONS}


def _mask(token_enc: str | None) -> tuple[bool, str | None]:
    """(is-set, masked-tail) for a stored encrypted key. Decrypts to derive the
    tail; degrades to (True, None) if the key can't be decrypted (e.g. the
    encryption key was rotated) rather than erroring the whole page."""
    if not token_enc:
        return False, None
    try:
        plain = crypto.decrypt(token_enc)
    except Exception:
        return True, None
    tail = plain[-4:] if len(plain) >= 4 else plain
    return True, f"…{tail}"


def _row(db: Session, user: User) -> UserSettings | None:
    return db.query(UserSettings).filter(UserSettings.userId == user.id).first()


def _to_out(row: UserSettings | None) -> SettingsOut:
    a_set, a_mask = _mask(row.anthropicApiKeyEnc if row else None)
    p_set, p_mask = _mask(row.apifyTokenEnc if row else None)
    return SettingsOut(
        anthropicKeySet=a_set,
        anthropicKeyMasked=a_mask,
        apifyTokenSet=p_set,
        apifyTokenMasked=p_mask,
        screeningModel=(row.screeningModel if row and row.screeningModel else settings.LLM_SCREENING_MODEL),
        generationModel=(row.generationModel if row and row.generationModel else settings.LLM_GENERATION_MODEL),
        modelOptions=MODEL_OPTIONS,
    )


@router.get("", response_model=SettingsOut)
def get_settings(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return _to_out(_row(db, current_user))


@router.put("", response_model=SettingsOut)
def update_settings(
    body: SettingsUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    for model_id in (body.screeningModel, body.generationModel):
        if model_id is not None and model_id not in _MODEL_IDS:
            raise HTTPException(status_code=422, detail=f"Unknown model: {model_id}")

    row = _row(db, current_user)
    if not row:
        row = UserSettings(userId=current_user.id)
        db.add(row)

    # Keys: None = leave unchanged, "" = clear, value = encrypt and store.
    try:
        if body.anthropicKey is not None:
            row.anthropicApiKeyEnc = (
                crypto.encrypt(body.anthropicKey) if body.anthropicKey else None
            )
        if body.apifyToken is not None:
            row.apifyTokenEnc = (
                crypto.encrypt(body.apifyToken) if body.apifyToken else None
            )
    except RuntimeError as e:  # APP_ENCRYPTION_KEY unset
        raise HTTPException(status_code=400, detail=str(e)) from e

    if body.screeningModel is not None:
        row.screeningModel = body.screeningModel or None
    if body.generationModel is not None:
        row.generationModel = body.generationModel or None

    db.commit()
    db.refresh(row)
    return _to_out(row)

from pydantic import BaseModel


class ModelOption(BaseModel):
    id: str
    label: str


class SettingsOut(BaseModel):
    """What the Settings page reads. Secret keys are never returned in full —
    only a masked tail and an 'is set' flag."""

    anthropicKeySet: bool
    anthropicKeyMasked: str | None = None
    apifyTokenSet: bool
    apifyTokenMasked: str | None = None
    screeningModel: str
    generationModel: str
    modelOptions: list[ModelOption]


class SettingsUpdateRequest(BaseModel):
    """What the Settings page writes. For the two secret keys, `None` (field
    omitted) means leave unchanged, an empty string means clear, and any other
    value replaces the stored key."""

    anthropicKey: str | None = None
    apifyToken: str | None = None
    screeningModel: str | None = None
    generationModel: str | None = None

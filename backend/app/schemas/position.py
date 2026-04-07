from pydantic import BaseModel


class PositionOut(BaseModel):
    id: str
    userId: str
    label: str

    model_config = {"from_attributes": True}


class PositionCreateRequest(BaseModel):
    label: str


class PositionDeleteRequest(BaseModel):
    id: str

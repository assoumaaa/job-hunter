from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.auth import get_current_user
from ..core.db import get_db
from ..models.position import Position
from ..models.user import User
from ..schemas.position import PositionCreateRequest, PositionDeleteRequest, PositionOut

router = APIRouter(prefix="/positions", tags=["positions"])


@router.get("", response_model=list[PositionOut])
def get_positions(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
):
    return db.query(Position).filter(Position.userId == current_user.id).all()


@router.post("", response_model=PositionOut, status_code=201)
def create_position(
    body: PositionCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    position = Position(userId=current_user.id, label=body.label)
    db.add(position)
    db.commit()
    db.refresh(position)
    return position


@router.delete("")
def delete_position(
    body: PositionDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    deleted = (
        db.query(Position)
        .filter(Position.id == body.id, Position.userId == current_user.id)
        .delete()
    )
    db.commit()
    if not deleted:
        raise HTTPException(status_code=404, detail="Position not found")
    return {"ok": True}

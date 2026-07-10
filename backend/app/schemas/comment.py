import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import Audience


class CommentCreate(BaseModel):
    period: date
    audience: Audience
    content: str = Field(..., min_length=1)


class CommentUpdate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentRead(BaseModel):
    id: uuid.UUID
    company_id: uuid.UUID
    period: date
    audience: str
    user_id: uuid.UUID | None
    author_name: str
    author_avatar_url: str | None = None
    content: str
    edited: bool
    created_at: datetime
    updated_at: datetime

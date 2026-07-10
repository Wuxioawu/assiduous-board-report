import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

from app.models.enums import InsightSeverity


class KeyStatRead(BaseModel):
    label: str
    value: str
    trend: Literal["up", "down", "neutral"]
    note: str | None = None


class InsightSectionRead(BaseModel):
    label: str
    summary: str
    key_stats: list[KeyStatRead]
    detail: str


class StructuredInsightContent(BaseModel):
    headline: str
    sections: list[InsightSectionRead]
    watch_items: list[str]


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    company_id: uuid.UUID
    audience: str
    period_start: date
    period_end: date
    insight_type: str
    title: str
    body: str
    # None for insights generated before this field existed - the frontend falls
    # back to rendering title/body as plain paragraphs in that case.
    structured_content: StructuredInsightContent | None = None
    # Human edit of the content, same shape - present only when is_edited. Kept
    # alongside (never replacing) structured_content so the original AI output
    # stays inspectable/revertible.
    edited_content: StructuredInsightContent | None = None
    is_edited: bool = False
    edited_by_user_id: uuid.UUID | None = None
    # Not a mapped column on Insight - resolved and attached by the route from a
    # User lookup, same pattern as CommentRead.author_name.
    edited_by_name: str | None = None
    edited_at: datetime | None = None
    severity: InsightSeverity
    created_at: datetime

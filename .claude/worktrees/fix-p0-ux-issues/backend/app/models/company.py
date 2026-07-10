import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Company(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "company"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    industry: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fiscal_year_end: Mapped[str | None] = mapped_column(String(10), nullable=True)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="USD")

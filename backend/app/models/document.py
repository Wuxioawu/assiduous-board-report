import uuid
from datetime import date

from sqlalchemy import Date, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin
from app.models.enums import DocumentStatus


class Document(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "document"

    organization_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organization.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company.id", ondelete="CASCADE"), nullable=False, index=True
    )
    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    storage_path: Mapped[str] = mapped_column(String(1000), nullable=False)
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status"),
        nullable=False,
        default=DocumentStatus.PENDING,
    )
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    # manual_upload | auto_fetched | api_import (see ARCHITECTURE.md §2) - how this
    # document entered the system.
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="manual_upload")
    # The exact URL a document was downloaded from, when source_type=auto_fetched -
    # used to avoid re-ingesting the same filing on a later check (see
    # services/extraction/auto_fetch.py). Null for manual uploads.
    source_url: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    # The source site's own stable identifier for this filing (e.g. the UUID in
    # its /results/{id} detail-page URL), when source_type=auto_fetched. Used
    # for dedup instead of filename/URL, since a filename alone can repeat
    # (version-like text) even though the underlying result is the same one
    # already ingested. Null for manual uploads.
    external_source_id: Mapped[str | None] = mapped_column(String(200), nullable=True, index=True)

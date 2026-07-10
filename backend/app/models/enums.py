import enum


class UserRole(str, enum.Enum):
    OWNER = "owner"
    ADMIN = "admin"
    ANALYST = "analyst"
    VIEWER = "viewer"


class DocumentStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    EXTRACTED = "extracted"
    FAILED = "failed"


class InsightSeverity(str, enum.Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class Audience(str, enum.Enum):
    MANAGEMENT = "management"
    BOARD = "board"
    EQUITY = "equity"
    CREDIT = "credit"


class InvitationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    EXPIRED = "expired"


class InvitationType(str, enum.Enum):
    # The invited email has no existing account anywhere - accepting creates one.
    NEW_USER = "new_user"
    # The invited email already has an account in a different organization -
    # accepting moves that account here rather than creating a second one.
    TRANSFER = "transfer"


class ReportingFrequency(str, enum.Enum):
    QUARTERLY = "quarterly"
    HALF_YEARLY = "half_yearly"
    ANNUAL = "annual"

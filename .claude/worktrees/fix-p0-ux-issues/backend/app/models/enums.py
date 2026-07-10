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

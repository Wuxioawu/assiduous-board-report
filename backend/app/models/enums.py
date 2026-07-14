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


class PeriodType(str, enum.Enum):
    """What a single FinancialStatement row's period_start/period_end actually
    covers - set per-statement (from what the source document itself says, e.g.
    "Half Year Results for the 6 months ended..."), independent of a company's
    Company.reporting_frequency (a static cadence setting used only for the
    CompanyPeriod dropdown's fiscal label - see fiscal_periods.py). A company
    can have both FY and HY rows (e.g. an annual report plus an interim half-
    year update), which reporting_frequency alone can't represent."""

    FY = "FY"
    HY = "HY"
    Q = "Q"


class StatementStatus(str, enum.Enum):
    """Whether a FinancialStatement row has passed ValidationService's
    accounting-identity checks (see services/validation/service.py) and can be
    trusted in metrics/charts, or failed one and needs an analyst to look at
    it. Defaults to CONFIRMED - a statement only becomes NEEDS_REVIEW when a
    rule it's involved in actually fails; there's no third "pending" state,
    since validation runs synchronously as part of extraction rather than as
    a separate later step."""

    CONFIRMED = "confirmed"
    NEEDS_REVIEW = "needs_review"

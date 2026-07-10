import logging
from pathlib import Path

from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import get_settings

logger = logging.getLogger(__name__)

_TEMPLATE_DIR = Path(__file__).parent / "templates"
_env = Environment(loader=FileSystemLoader(_TEMPLATE_DIR), autoescape=select_autoescape(["html"]))


def _connection_config() -> ConnectionConfig:
    settings = get_settings()
    return ConnectionConfig(
        MAIL_USERNAME=settings.smtp_username or "",
        MAIL_PASSWORD=settings.smtp_password or "",
        MAIL_PORT=settings.smtp_port,
        MAIL_SERVER=settings.smtp_host,
        MAIL_STARTTLS=True,
        MAIL_SSL_TLS=False,
        MAIL_FROM=settings.smtp_from_email or settings.smtp_username,
        MAIL_FROM_NAME=settings.smtp_from_name,
        USE_CREDENTIALS=True,
        VALIDATE_CERTS=True,
    )


async def send_email(to: str, subject: str, html_body: str) -> bool:
    """Send an HTML email over SMTP.

    Returns True on success, False on failure. Email delivery is
    best-effort: a send failure must never break the calling flow
    (invitations and password resets still complete either way), so
    failures are caught and logged here rather than raised.
    """
    settings = get_settings()
    if not settings.smtp_username or not settings.smtp_password:
        logger.error("Failed to send email to %s: SMTP is not configured (missing username/password)", to)
        return False

    message = MessageSchema(subject=subject, recipients=[to], body=html_body, subtype=MessageType.html)
    try:
        await FastMail(_connection_config()).send_message(message)
        return True
    except Exception as exc:  # noqa: BLE001 - any SMTP/network failure must degrade gracefully
        logger.error("Failed to send email to %s: %s", to, exc)
        return False


def render_invitation_email(
    *,
    inviter_name: str,
    organization_name: str,
    role: str,
    token: str,
    expires_days: int,
    is_transfer: bool = False,
    current_organization_name: str | None = None,
) -> tuple[str, str]:
    settings = get_settings()
    invitation_link = f"{settings.frontend_base_url}/accept-invitation?token={token}"
    subject = f"You've been invited to join {organization_name} on Assiduous Board Report"
    html = _env.get_template("invitation.html").render(
        inviter_name=inviter_name,
        organization_name=organization_name,
        role=role,
        invitation_link=invitation_link,
        expires_days=expires_days,
        is_transfer=is_transfer,
        current_organization_name=current_organization_name,
    )
    return subject, html


def render_password_reset_email(*, token: str, expires_minutes: int) -> tuple[str, str]:
    settings = get_settings()
    reset_link = f"{settings.frontend_base_url}/reset-password?token={token}"
    subject = "Reset your Assiduous Board Report password"
    html = _env.get_template("password_reset.html").render(
        reset_link=reset_link, expires_minutes=expires_minutes
    )
    return subject, html

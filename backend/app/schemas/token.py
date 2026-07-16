from app.schemas.base import AppBaseModel


class Token(AppBaseModel):
    access_token: str
    token_type: str = "bearer"

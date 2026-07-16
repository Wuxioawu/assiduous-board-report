from pydantic import BaseModel, ConfigDict


class AppBaseModel(BaseModel):
    """Base for every request/response schema in the app.

    str_strip_whitespace=True trims leading/trailing whitespace off every
    string field before any other validation runs - so a pasted value like
    "https://www.senus.com " (trailing space from copy-paste) is validated
    and stored as the trimmed string instead of failing format validators
    (URL/email patterns don't allow whitespace) or persisting the stray
    whitespace. Subclassing this instead of pydantic.BaseModel directly is
    what makes that automatic for every current and future schema - a
    subclass's own model_config (e.g. from_attributes=True) merges with
    this one rather than replacing it.
    """

    model_config = ConfigDict(str_strip_whitespace=True)

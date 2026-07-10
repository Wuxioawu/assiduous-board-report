import uuid
from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.comment import Comment
from app.models.user import User


class CommentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_for_period_audience(
        self, *, company_id: uuid.UUID, organization_id: uuid.UUID, period: date, audience: str
    ) -> list[tuple[Comment, str | None, str | None]]:
        result = await self.session.execute(
            select(Comment, User.full_name, User.avatar_url)
            .join(User, User.id == Comment.user_id, isouter=True)
            .where(
                Comment.company_id == company_id,
                Comment.organization_id == organization_id,
                Comment.period == period,
                Comment.audience == audience,
            )
            .order_by(Comment.created_at.desc())
        )
        return [(row[0], row[1], row[2]) for row in result.all()]

    async def get_by_id(self, comment_id: uuid.UUID, *, organization_id: uuid.UUID) -> Comment | None:
        result = await self.session.execute(
            select(Comment).where(Comment.id == comment_id, Comment.organization_id == organization_id)
        )
        return result.scalar_one_or_none()

    async def get_author_info(
        self, user_id: uuid.UUID | None, *, organization_id: uuid.UUID
    ) -> tuple[str | None, str | None]:
        if user_id is None:
            return None, None
        result = await self.session.execute(
            select(User.full_name, User.avatar_url).where(
                User.id == user_id, User.organization_id == organization_id
            )
        )
        row = result.one_or_none()
        return (row[0], row[1]) if row else (None, None)

    async def create(
        self,
        *,
        organization_id: uuid.UUID,
        company_id: uuid.UUID,
        period: date,
        audience: str,
        user_id: uuid.UUID | None,
        content: str,
    ) -> Comment:
        comment = Comment(
            organization_id=organization_id,
            company_id=company_id,
            period=period,
            audience=audience,
            user_id=user_id,
            content=content,
        )
        self.session.add(comment)
        await self.session.flush()
        return comment

    async def update_content(self, comment: Comment, *, content: str) -> None:
        comment.content = content
        comment.edited = True
        await self.session.flush()

    async def delete(self, comment: Comment) -> None:
        await self.session.delete(comment)
        await self.session.flush()

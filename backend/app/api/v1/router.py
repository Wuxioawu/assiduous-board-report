from fastapi import APIRouter

from app.api.v1.routes import (
    auth,
    budgets,
    comments,
    companies,
    documents,
    export,
    financial_statements,
    health,
    insights,
    metrics,
    organizations,
    users,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(companies.router)
api_router.include_router(documents.router)
api_router.include_router(financial_statements.router)
api_router.include_router(metrics.router)
api_router.include_router(insights.router)
api_router.include_router(export.router)
api_router.include_router(budgets.router)
api_router.include_router(comments.router)
api_router.include_router(organizations.router)
api_router.include_router(users.router)

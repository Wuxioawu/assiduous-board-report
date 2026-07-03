from fastapi import APIRouter

from app.api.v1.routes import auth, companies, documents, health

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(companies.router)
api_router.include_router(documents.router)

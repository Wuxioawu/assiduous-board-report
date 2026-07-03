# Assiduous Board Report Platform

An extensible, AI-native financial board reporting platform built for Assiduous: it turns uploaded
financial filings into structured data, visualized metrics, and AI-generated insights, serving four
distinct reporting perspectives — Management, the Board, Equity investors, and Credit providers.

**Senus PLC** is the first onboarded case study.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for architecture and domain model details, and
[`CLAUDE.md`](./CLAUDE.md) for repo conventions and dev commands.

## Current Stage (Phase 1)

Multi-tenancy + auth + backend skeleton + visualization frontend skeleton up and running:

- Multi-tenant data model (8 core tables, row-level `organization_id` isolation)
- Register / login, JWT auth
- FastAPI backend skeleton + Alembic migrations
- React + TypeScript + Vite frontend skeleton, showing the company list after login, chart components
  (mock data) validating the visualization pipeline

File upload processing, LLM extraction, real metric calculation, and AI insight generation are left
for the next phase.

## Quick Start

```bash
# 1. Start the database
docker compose up -d db

# 2. Backend
cd backend
python3.12 -m venv .venv && source .venv/bin/activate
pip install -e .
cp .env.example .env   # edit as needed
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 3. Frontend (new terminal)
cd frontend
npm install
npm run dev
```

The frontend runs by default at http://localhost:5173, and the backend API at http://localhost:8000/api/v1.

# Assiduous Board Report Platform — Commercial SaaS Architecture

> Multi-tenant AI-native financial board reporting platform, built for Assiduous.
> First case study: Senus PLC. Designed to onboard any company as a client engagement grows.

---

## 1. Product Vision

A SaaS platform where any organization (Assiduous itself, or its clients — a PE fund, a corporate finance
team, a board secretariat, an accountancy firm serving multiple clients) can:

1. Add one or more **companies** they want to track/report on.
2. Feed those companies' financial data in — via **manual document upload** now, **automated fetch** later.
3. Get an **AI-native Board Report** — auto-extracted metrics, computed ratios, and AI-generated narrative
   commentary — tailored to different stakeholder views (Management / Board / Equity Investors / Credit
   Providers).

---

## 2. Core Domain Model (Multi-Tenant)

```
Organization                      # the paying customer / internal Assiduous team (tenant)
 ├── id, name, plan_tier, created_at
 │
 ├── User                         # people who log in
 │    ├── id, organization_id, email, password_hash / oauth_id, role (owner/admin/analyst/viewer)
 │
 ├── Company                      # the entity being analyzed (Senus, or any other client)
 │    ├── id, organization_id, name, ticker, sector, currency, fiscal_year_end
 │    │
 │    ├── Document                # raw source files
 │    │    ├── id, company_id, uploaded_by_user_id, file_name, storage_key,
 │    │    │   source_type (manual_upload | auto_fetched | api_import),
 │    │    │   status (pending | processing | extracted | failed), uploaded_at
 │    │
 │    ├── FinancialStatement      # normalized line items extracted from Documents
 │    │    ├── id, company_id, document_id (traceability), period_start, period_end,
 │    │    │   line_item_code (standardized taxonomy, e.g. REVENUE, COGS, EBITDA),
 │    │    │   value, currency, confidence_score, extracted_by (ai | manual_override), source_excerpt
 │    │
 │    ├── Metric                  # computed/derived values, cached
 │    │    ├── id, company_id, period, metric_type (yoy_growth, gross_margin, dscr, roce, ...), value
 │    │
 │    └── Insight                 # AI-generated narrative commentary
 │         ├── id, company_id, period, audience (management|board|equity|credit),
 │         │   content, generated_at, model_version, reviewed_by_user_id (nullable)
 │
 └── AuditLog                     # who did what, when — needed for credibility with board/credit audiences
      ├── id, organization_id, user_id, action, entity_type, entity_id, metadata, timestamp
```

**Design principles:**
- Every data-bearing table carries `organization_id` (directly or via `company_id →
  organization_id`) — this is the tenant isolation boundary. Enforce it in a single repository-layer
  filter (a FastAPI dependency injecting tenant context), not scattered ad hoc.
- `FinancialStatement.line_item_code` uses a **standardized taxonomy** (not company-specific field names)
  so extraction and metrics logic is reusable across any client, not just Senus.
- `Document → FinancialStatement` keeps a source reference (`source_excerpt`, page/section if available)
  so every AI-extracted number can be traced back and verified — satisfies the assessment's "stand over
  the outputs generated" requirement, and is a real trust requirement for credit providers/boards.

---

## 3. Tech Stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | **Python 3.12, FastAPI** | REST API, business logic, async-first |
| ORM / Migrations | SQLAlchemy 2.x (async) + Alembic | |
| Frontend | React + TypeScript + Vite | Dashboard SPA |
| Visualization | **Recharts** (all charts, including the EBITDA→FCF cash bridge) | Originally Plotly for the cash bridge; migrated to a stacked Recharts bar to keep one charting library and cut bundle size |
| Database | PostgreSQL 15+ | Primary store; JSONB for flexible extracted fields |
| Auth | JWT (python-jose) + passlib for hashing, OAuth2 (Google) ready | Multi-tenant aware |
| File storage | Abstracted `StorageService` interface | Local disk in dev, S3-compatible in prod |
| Async processing | FastAPI `BackgroundTasks` → migrate to Celery/RQ + Redis or SQS as volume grows | Needed because AI extraction is slow |
| AI extraction | Anthropic/OpenAI SDK, structured JSON output | Prompted against the standardized line-item taxonomy |
| AI narrative | Same LLM, fed computed metrics + prior period context | Cached per period/audience |
| Observability | Structured logging (JSON) + basic metrics | Prometheus-compatible later |
| Deployment | Docker Compose (dev) → Render (prod), see `render.yaml` | DB is Neon (serverless Postgres); storage is Supabase in prod |
| Schema migrations | Alembic, gated on every prod deploy | `render.yaml`'s `preDeployCommand` runs `alembic upgrade head` before traffic cuts over to the new deploy - a failed migration aborts the deploy and leaves the previous version serving (see `backend/Dockerfile` for the redundant CMD-level fallback gate, and `GET /api/v1/health/config` for the `schema_current` check) |
| CI/CD | GitHub Actions | Build, test, lint on PR (see `.github/workflows/ci.yml`); deploy-on-merge not yet set up |

---

## 4. Backend Module Layout

```
backend/app/
 ├── core/
 │    ├── config.py            # env/settings via pydantic-settings
 │    ├── security.py          # JWT issue/verify, password hashing
 │    └── tenant_context.py    # request-scoped org_id (contextvars)
 ├── api/v1/
 │    ├── router.py
 │    └── routes/
 │         ├── auth.py
 │         ├── organizations.py
 │         ├── companies.py
 │         ├── documents.py    # upload endpoint
 │         ├── metrics.py
 │         └── insights.py
 ├── models/                   # SQLAlchemy ORM: Organization, User, Company, Document,
 │                                FinancialStatement, Metric, Insight, AuditLog
 ├── schemas/                  # Pydantic request/response models
 ├── services/
 │    ├── auth_service.py
 │    ├── company_service.py
 │    ├── document/storage.py  # StorageService interface + Local/S3 impls
 │    ├── extraction/          # generic, taxonomy-driven LLM extraction
 │    ├── metrics/             # growth, profitability, cash, solvency, returns calculators
 │    ├── insight/             # AI commentary generation
 │    └── audit_service.py
 ├── repositories/             # DB queries, always scoped by organization_id
 └── db/
      ├── session.py
      └── base.py
```

---

## 5. Extraction Pipeline (the technical core)

1. User uploads a document (PDF/XLSX) via `documents.py` route → stored via `StorageService` → `Document`
   row created with `status = pending`.
2. Background task picks it up → parses raw text/tables → sends to LLM with a **fixed JSON schema prompt**
   keyed to the standardized taxonomy (revenue, COGS, opex categories, EBITDA, cash, debt, etc.) → LLM
   returns structured JSON with a source excerpt per field.
3. Each field is written as a `FinancialStatement` row, tagged `extracted_by = ai`, with a
   `confidence_score`.
4. Low-confidence fields are flagged in the UI for **human review/override** — an override updates the
   row, tags `extracted_by = manual_override`, and logs to `AuditLog`. Satisfies the assessment's
   validation requirement and is a real trust feature for a commercial tool.
5. `Metric` values are computed from `FinancialStatement` rows on-demand or scheduled, cached, invalidated
   when underlying line items change.
6. `Insight` narrative is generated from the computed `Metric` set + prior-period trend, cached per
   (company, period, audience).

---

## 6. Phased Roadmap

### Phase 1 — MVP (build first)
- Multi-tenant schema in place from day one
- Real JWT auth
- Manual document upload → AI extraction → metrics → dashboard, for any company (not hardcoded to Senus)
- Four audience-based dashboard views with real charts (Recharts)
- Audit log
- README documenting architecture, AI workflow, assumptions, validation approach

### Phase 2 — Commercial hardening (after initial submission)
- Stripe billing / plan tiers
- OAuth login (Google/Microsoft), SSO for enterprise tier
- S3-backed storage, CDN for frontend
- Move async extraction to Celery/RQ + Redis (or SQS) with retries and dead-letter handling
- Automated company data fetch (exchange filings, investor relations scraping) alongside manual upload
- Fine-grained per-company access permissions within an org
- Security/compliance hardening (encryption at rest, access logging, retention policies) for
  enterprise/financial clients
- Multi-currency and multi-GAAP/IFRS taxonomy support
- Export to PDF/PPT board pack format

---

## 7. What This Gets You: Assessment vs. Product

| Requirement from assessment | Covered by this architecture |
|---|---|
| "AI methods for extracting financial info into a database" | §5, generic taxonomy-driven pipeline |
| "Production-quality engineering... scalable design" | Multi-tenant schema, abstracted storage, async processing |
| "Detail steps, tools, stand over outputs" | Source excerpt + confidence score + human override + audit log |
| "Platform a CEO would log in to and use" | Real auth, real dashboard, not a static report |
| Not tied to this one assessment | Company-agnostic data model, org/tenant layer, extensible taxonomy |
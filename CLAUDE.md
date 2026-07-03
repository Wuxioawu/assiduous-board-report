# Assiduous Board Report Platform — Project Instructions

> Extracted from Assiduous "Technology Graduate Assessment" brief (Summer/Autumn 2026), expanded into a
> commercial, multi-tenant SaaS product built as a service for Assiduous.
> This file lives at the project root so Claude Code can read it as context for every task.

## 1. Product Positioning

**Assiduous Board Report Platform** — an AI-native, multi-tenant financial board reporting platform.
Any organization can onboard a company they want to track, feed in financial data (manual upload now,
automated fetch later), and get an AI-generated Board Report tailored to Management, the Board, Equity
Investors, and Credit Providers.

The first real-world case study driving this build is **Senus PLC**, an Assiduous client.

## 2. Client Background — Senus PLC (first case study)

- Senus PLC: Irish-headquartered provider of **Natural Capital management software and technology solutions**.
- Admitted to trading on the **Euronext Access market in Dublin on 22 December 2025**.
- Founded 2017 by Brendan Allen, Eoghan Finneran, Joe Desbonnet. HQ in Ireland.
- Product enables **Measurement, Reporting, Verification, and Planning (MRVP)** of natural-resource value
  chains for governments, state agencies, financial institutions, corporations, farmers, and landowners.
  Sold directly or via intermediaries (agronomists, consultants).
- Footprint: Ireland (core), growing UK presence, initial presence in mainland Europe.
- Financials known from the brief:
  - FY ended 30 June 2025: revenue **€836,991**, **138 customer accounts**.
  - First public-company results: half-year results for period ended December 2025, reported March 2026.
  - Strategy "Senus 2030": target **≥50% CAGR in sales, 2026–2030**.
- Investor relations / reference materials: `https://app.assiduous.tech/investor-relations/senus`
  **Action needed:** fetch/download available filings from this site to seed the extraction pipeline.

## 3. Original Assessment Requirements (must still be satisfied)

Design and build an AI-native platform that prepares a Board Report for four audiences: Management, the
Board, Equity Investors, Credit Providers.

### Required financial metrics (minimum set)

| Category | Metrics |
|---|---|
| Growth & Revenue | YoY growth, MoM growth, customer count trend, revenue by channel, bookings |
| Profitability | Gross margin, operating margin, EBITDA margin, cost breakdown |
| Cash & Liquidity | EBITDA → Free Cash Flow bridge, cash runway, working capital |
| Solvency & Leverage | Debt Service Coverage Ratio (DSCR), leverage ratios |
| Returns | ROCE (Return on Capital Employed) |
| AI-Powered Insights | Narrative commentary / financial analysis generated where appropriate |

### Deliverables (for assessment submission)

1. README.md — architecture overview, technologies used, AI-assisted development workflow, assumptions,
   how outputs were validated.
2. YouTube link to a demo video.
3. GitHub link to project repo.
4. One-page write-up (optional).

Note: no hard deadline was found in the source PDF — the submission link ("Technology Graduate
Submission") likely carries the actual date; confirm separately with Assiduous.

## 4. Product Requirement: Extensibility Beyond Senus

This is **not** built as a Senus-only tool. Key product decisions:

- **Multi-tenant from day one**: an `Organization` (the Assiduous customer / internal team) owns `Company`
  records (the entities being analyzed, e.g. Senus). All data scoped by `organization_id`.
- **Company-agnostic extraction**: financial line items are normalized to a standardized taxonomy
  (REVENUE, COGS, EBITDA, etc.), not hardcoded to Senus's specific report format.
- **Data ingestion — two paths**:
  1. **Manual upload** (build first): users upload PDFs/filings per company.
  2. **Automated fetch** (roadmap): auto-pull filings for a given ticker/company — deferred due to
     complexity (inconsistent exchange formats, parsing variance); architecture should leave a clean
     extension point (a `source_type` field on `Document`, a pluggable fetcher interface).

## 5. Technical Architecture (current decision)

- **Backend: Python (FastAPI)** — chosen over Spring Boot for faster iteration on the AI/LLM extraction
  pipeline and to build on the developer's growing Python/FastAPI skillset.
- **Frontend: React + TypeScript + Vite**, with a strong emphasis on **data visualization** (Recharts for
  standard charts, Plotly for more complex interactive charts like cash-flow bridges).
- **Database: PostgreSQL**, accessed via SQLAlchemy (async) + Alembic migrations.
- **Auth: JWT-based**, multi-tenant aware (org_id embedded in token, enforced via FastAPI dependency).
- **File storage**: abstracted `StorageService` interface — local filesystem in dev, swappable to
  S3-compatible storage in production.
- **AI extraction**: LLM structured-output extraction (Anthropic/OpenAI SDK) against the standardized
  taxonomy, with source-excerpt + confidence score stored alongside every extracted value for
  traceability/validation.
- **AI narrative insights**: LLM-generated commentary per company/period/audience, cached.

Full detail: see `ARCHITECTURE.md`.

## 6. Evaluation Signals (read between the lines of the original brief)

- Must be able to **defend/validate every AI output** — build in an audit trail (source citation next to
  every extracted number) rather than trusting LLM output blindly.
- "Platform a CEO would log in to" implies **real auth + a real dashboard UX**, not a static report.
- Four distinct audiences suggests **audience/role-based views** emphasizing different metrics (e.g.
  credit providers care about DSCR/leverage; equity investors care about growth/ROCE).

## 7. Phased Roadmap

**Phase 1 — MVP (assessment-ready, build now)**
- Multi-tenant schema, real JWT auth, manual upload → AI extraction → metrics → dashboard for any company
- Four audience-based views
- Audit log
- README per assessment requirements

**Phase 2 — Commercial hardening (after initial submission)**
- Billing/subscription tiers (Stripe), OAuth/SSO
- S3 storage, real async task queue (RabbitMQ/SQS/Celery)
- Automated company data fetch
- Fine-grained per-company access permissions within an org
- Security/compliance hardening (encryption at rest, retention policies) for financial/enterprise clients
- Multi-currency, multi-GAAP/IFRS taxonomy support
- PDF/PPT board-pack export

## 8. Open Items / Next Steps for Claude Code

- [ ] Fetch and inventory all documents at the Senus investor relations URL
- [ ] Scaffold multi-tenant FastAPI + React project (see ARCHITECTURE.md §4 for module layout)
- [ ] Define standardized financial line-item taxonomy
- [ ] Build extraction pipeline (PDF/filing → LLM structured output → DB) with source-citation storage
- [ ] Build FastAPI endpoints for metrics per category
- [ ] Build React dashboard with audience-based views and real charts (Recharts/Plotly)
- [ ] Add AI-generated narrative commentary endpoint
- [ ] Write README per assessment Section 5 requirements
- [ ] Record demo video, push to GitHub, submit
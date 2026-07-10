# Roadmap & Known Limitations — Assiduous Board Report Platform

> This document frames the platform's current state against its intended primary users —
> CEOs, board members, equity investors, and credit providers — and lays out what's needed
> to move from "working demo" to "something a real executive team would adopt."

---

## 1. Who This Product Is For

The platform is built for **decision-makers, not analysts**: CEOs, CFOs, board members,
institutional investors, and credit providers. This shapes the core design principle for
everything going forward:

> These users have no patience and no time to learn the system. They need to understand
> what happened in seconds, not explore features.

This is a meaningfully different product philosophy than a BI tool built for analysts —
it means trust, clarity, and professional polish matter more than feature breadth.

---

## 2. What's Working Well (Phase 1 MVP — current state)

- **Trustworthy data pipeline**: AI-extracted financial figures carry source citations,
  confidence scores, and a full audit trail for manual overrides. This is the prerequisite
  for any executive to be willing to put real company data into the system at all — without
  it, every number looks like it could be an AI hallucination.
- **Professional visual polish**: icon-based actions, consistent dark theme, no redundant
  navigation, dynamic currency formatting. Executives are highly sensitive to anything that
  reads as "unpolished" — they're comparing this, consciously or not, to Bloomberg terminals
  and investment-bank reporting decks.
- **Audience-differentiated views**: Management, Board, Equity Investors, and Credit
  Providers see different metric emphasis (e.g. credit providers see DSCR/leverage
  prominently; equity investors see growth/ROCE) — the right product instinct for a board
  report tool serving multiple stakeholder types.
- **Multi-tenant architecture**: company-agnostic taxonomy, organization-scoped data
  isolation — the technical foundation needed to serve more than one client company.

---

## 3. The Core Gap: This Is Still a Single-User Tool

The single biggest gap between the current MVP and something a real executive team would
adopt: **there is no concept of a team using this system together.**

In practice, a CEO almost never personally uploads a PDF or manually reviews an extraction
table line by line — that's done by a CFO or financial analyst. The CEO expects to open the
system and see a report that "the team" already maintains. Right now:

- There is no way to invite a colleague into an organization.
- There is only one role in practice ("owner") — no real role-based access control (a CFO
  who should edit data, vs. a board member who should only view, vs. an investor-relations
  contact who should only see the Equity view).
- Every action in the audit log is attributed to whichever single account is shared across
  the team, which defeats the purpose of an audit trail in a real multi-person organization.

This is the first question a real CEO would ask when trying the product: **"How does my CFO
get in?"** Not having an answer signals the product isn't ready for real organizational use,
regardless of how polished the rest of the experience is.

---

## 4. Prioritized Gaps (CEO/Board-User Perspective)

### P0 — Blocking real adoption (a CEO would not put real company data in without these)

| Gap | Why it matters |
|---|---|
| Team invitations + role-based access control (RBAC) | Real organizations are never single-user; audit trail is meaningless without per-person attribution |
| Two-factor authentication (2FA) | A compromised CEO account exposes the entire company's financial data — unacceptable risk at this stakes level |
| Export to PDF/PPT | Board meetings require a document that can be printed/circulated, not a live dashboard everyone crowds around a laptop to see |

### P1 — Meaningfully increases perceived value once P0 is addressed

| Gap | Why it matters |
|---|---|
| Budget vs. Actual comparison | A core recurring board-report question ("where are we against the targets we set") — currently only historical actuals exist, no budget/target dimension |
| CEO/CFO annotation on AI insights | AI narrative is generic; executives want to add their own context (e.g. "this dip was due to a one-off Q3 event") next to the numbers, and currently AI-generated and human commentary are fully disconnected |
| Mobile responsiveness | Executives frequently check reports between meetings or while traveling; a desktop-only experience is a real friction point |
| Executive-level "what changed" summary | Currently, seeing what a CFO changed requires opening each individual value's History modal — no roll-up view of "what's different since I last looked" |

### P2 — Nice to have, not adoption-blocking

| Gap | Why it matters |
|---|---|
| Industry benchmarking | Boards often ask "how do we compare to peers" — out of scope for now but worth tracking |
| Session/device management, login alerts | Good security hygiene, lower urgency than 2FA itself |

**Known simplification — automated filing ingestion (`backend/app/services/extraction/auto_fetch.py`):**
implemented for a single confirmed source (Senus PLC's investor-relations site), including
filtering out non-financial entries (press releases, AGM notices, leadership announcements) by
matching each entry's visible category label + title against a small include/exclude keyword
list, erring toward fetching when a label is ambiguous. This is a pragmatic MVP heuristic, not a
classifier — a production version would more likely attempt extraction on every discovered
document and gracefully handle "no financial data found" for the ones that turn out irrelevant,
rather than pre-filtering by label text that could vary by source site or change without notice.

---

## 5. Framing for the Assessment Submission

For the purposes of the Assiduous technical assessment, the above should be read as:
**deliberate scoping decisions, not oversights.** Phase 1 intentionally prioritized building
a defensible, auditable AI extraction pipeline and a company-agnostic multi-tenant
architecture — the parts that are hardest to retrofit later — over team-collaboration
features, which can be layered on top of a sound foundation without re-architecting.

The README and one-page write-up should explicitly name this tradeoff: the current
single-organization-owner model was a scoping choice to focus engineering effort on data
trust and extensibility first, with a clear, already-designed path (see Section 4, P0) to
multi-user team collaboration as the immediate next phase.

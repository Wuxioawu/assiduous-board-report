# Git Workflow & Commit Conventions — Assiduous Board Report Platform

This document defines how we commit, branch, and version this project. Following it keeps history
readable, makes code review easier, and produces a changelog we can actually use later.

---

## 1. Commit Message Format (Conventional Commits)

Every commit message follows this structure:

```
<type>(<scope>): <short summary>

[optional body]

[optional footer]
```

### Type (required)

| Type | When to use |
|---|---|
| `feat` | A new feature |
| `fix` | A bug fix |
| `refactor` | Code change that neither fixes a bug nor adds a feature |
| `docs` | Documentation only |
| `style` | Formatting, whitespace, missing semicolons — no logic change |
| `test` | Adding or fixing tests |
| `chore` | Build process, dependency bumps, tooling, CI config |
| `perf` | Performance improvement |

### Scope (recommended)

The module or area affected. Keep it short and consistent:
 
`auth`, `company`, `document`, `extraction`, `metrics`, `insight`, `frontend`, `db`, `infra`

### Summary rules

- Imperative mood: "add", not "added" or "adds"
- No period at the end
- Under ~72 characters
- Lowercase after the colon

### Examples

```
feat(auth): add JWT-based login and register endpoints
fix(document): correct storage path when company_id contains special characters
refactor(metrics): extract margin calculations into shared utility
docs(readme): add architecture overview and AI workflow section
chore(deps): bump fastapi to 0.115
test(extraction): add unit tests for taxonomy mapping
```

### Body (when the change needs explanation)

Use the body to explain **why**, not just what — the diff already shows what changed.

```
fix(extraction): retry LLM call on malformed JSON response

The LLM occasionally returns truncated JSON when the source document
exceeds ~15 pages. Added a single retry with a stricter schema prompt
before marking the document as failed.
```

### Breaking changes

Add a footer, and prefix the type with `!` if the change breaks an existing API contract:

```
feat(api)!: rename /companies/{id}/docs to /companies/{id}/documents

BREAKING CHANGE: frontend clients must update the documents endpoint path.
```

### Referencing issues

```
fix(auth): handle expired refresh token gracefully

Closes #23
```

---

## 2. Branching Strategy

```
main                  # always deployable; protected branch
 ├── feat/company-crud
 ├── feat/document-upload
 ├── fix/jwt-expiry-bug
 └── chore/ci-pipeline
```

- **`main`**: protected, no direct pushes. Every change lands via PR.
- **Feature/fix branches**: `<type>/<short-kebab-description>`, branched off `main`.
  - `feat/document-upload`
  - `fix/tenant-context-leak`
  - `chore/update-flyway-to-alembic`
- Keep branches short-lived — merge and delete once the PR is merged.
- If the project grows a real release cadence later, introduce `develop` + `release/x.y` branches at that
  point. Don't add that overhead now.

---

## 3. Pull Request Conventions

Even solo, open PRs against `main` rather than pushing directly — it keeps a reviewable history and gives
you a natural changelog.

**PR title**: same format as commit type/scope, e.g. `feat(extraction): add LLM structured extraction pipeline`

**PR description template**:

```markdown
## What
Brief description of the change.

## Why
What problem this solves / what requirement it satisfies.

## How
Key implementation notes, especially any non-obvious decisions.

## Testing
How this was verified (manual steps, automated tests run).

## Screenshots (if UI change)
```

- Squash-merge into `main` so each merged PR = one clean commit in history.
- The squash commit message should itself follow the Conventional Commits format above.

---

## 4. Versioning

Once the MVP (Phase 1) is functionally complete, start tagging releases using **Semantic Versioning**:

```
v0.1.0   # first working end-to-end demo (Senus case study)
v0.2.0   # + real metrics + AI insight generation
v1.0.0   # assessment submission-ready
v1.1.0   # first Phase 2 commercial feature (e.g. billing)
```

- `MAJOR`: breaking API/schema changes
- `MINOR`: new features, backward compatible
- `PATCH`: bug fixes only

Tag with: `git tag -a v0.1.0 -m "First end-to-end demo: upload, extract, view metrics"`

---

## 5. What Stays Out of the Repo

See `.gitignore`. In addition to standard Python/Node ignores, this project excludes:

- `CLAUDE.md`, `ARCHITECTURE.md` — internal planning docs, not part of the public deliverable
- `backend/storage/` — locally uploaded documents (contain real/test client financial data)
- `.env`, `*.local.yml` — secrets and local config

If architecture context needs to be visible to reviewers, put a condensed version directly in
`README.md` rather than un-ignoring the internal docs.

---

## 6. Quick Reference

```bash
git checkout -b feat/company-crud
# ... make changes ...
git add .
git commit -m "feat(company): add company CRUD endpoints and list view"
git push -u origin feat/company-crud
# open PR against main, squash-merge once reviewed
```

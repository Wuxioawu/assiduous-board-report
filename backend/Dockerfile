FROM python:3.12-slim

# System dependencies for WeasyPrint (PDF rendering: cairo, pango, gdk-pixbuf)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf-2.0-0 \
    libffi-dev shared-mime-info fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Project uses pyproject.toml (no requirements.txt) - install the package plus its
# declared runtime dependencies in editable mode.
RUN pip install --no-cache-dir -e .

# Install Playwright's Chromium binary plus its own required system dependencies
RUN playwright install --with-deps chromium

EXPOSE 8000

# Belt-and-suspenders migration gate: render.yaml's preDeployCommand (see repo
# root) is the primary gate - it runs `alembic upgrade head` once, in its own
# ephemeral instance, before Render cuts traffic over to the new deploy, and
# a non-zero exit there aborts the deploy outright with the old version still
# serving. This CMD-level `&&` is a second, redundant gate for the case where
# the service isn't (yet) Blueprint-synced to render.yaml, or preDeployCommand
# hasn't been enabled in the dashboard: if migrations fail here, uvicorn never
# starts, so this container never passes its health check, and Render's
# zero-downtime deploy leaves the previous (already-migrated) version serving
# instead of cutting over to a container running against an unmigrated schema.
# `alembic upgrade head` is idempotent, so running it twice (once via
# preDeployCommand, once here) on a normal deploy is a harmless no-op, not a
# double-migration.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

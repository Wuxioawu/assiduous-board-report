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

# Run migrations then start the server - this means Render will run alembic upgrade head
# automatically on every deploy, keeping the production schema in sync with the latest
# migration in the codebase.
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]

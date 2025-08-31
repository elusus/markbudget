# MarkBudget

YNAB-style budgeting app (clean-room clone in spirit). Monorepo with Next.js web and FastAPI API.

## Layout
- `web/` Next.js 14 (App Router)
- `api/` FastAPI + Alembic
- `infra/` Docker Compose + `.env`
- `docs/` Design notes; see `project plan.md`

## Quick Start (dev)

1. Copy env template:
   ```bash
   cp infra/.env.example infra/.env
   ```
2. Start services (auto-migrates DB on API start):
   ```bash
   docker compose -f infra/docker-compose.yml up -d --build
   ```
3. (Optional) Re-run migrations manually:
   ```bash
   docker compose -f infra/docker-compose.yml exec api alembic upgrade head
   ```
4. Open:
   - API docs: http://localhost:8000/docs (health at `/health`)
   - Web: http://localhost:3000

## Notes
- DB URL uses integer cents; see `project plan.md` for schema and invariants.
- Change JWT secrets in `infra/.env` for local-only usage.

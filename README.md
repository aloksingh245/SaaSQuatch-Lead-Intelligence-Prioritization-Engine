# SaaSQuatch Lead Intelligence

SaaSQuatch can produce a large lead list. This POC makes that list usable: it imports messy CSV/XLSX data, normalizes it, removes duplicates, scores each company against an Ideal Customer Profile (ICP), and gives sales a ranked queue with a reason for every score.

## Product decision

This is a quality-first enhancement to the SaaSQuatch lead-generation workflow. It deliberately uses uploaded lead lists as its source of truth. Web scraping and fabricated enrichment are not part of the demo, so the results stay auditable and honest.

## What is included

- CSV/XLSX/XLS import with background job progress
- Canonical domains, industries, countries, employee counts, revenue, and email validation
- Duplicate detection by domain or normalized company name
- Duplicate audit log with field-level conflicts
- Explainable 0–100 scoring against a configurable ICP, including exact, graded partial, and missing-data outcomes
- Separate ICP-fit and outreach-readiness scores
- Priority gating so contact completeness cannot hide a poor ICP match
- Search, priority, country, score, and contactability filters
- Lead detail “score X-ray” with missing-data guidance
- Filtered CSV export
- 240-row labeled benchmark dataset plus 120-row partial-score, 180-row messy CRM, and 70-row duplicate/conflict datasets

## Architecture

```text
React + Vite frontend
        │ /api proxy
Express REST API
        │
PostgreSQL
  ├─ icp_profiles
  ├─ processing_runs
  ├─ leads
  ├─ lead_scores
  ├─ enrichment_results
  └─ duplicate_log
```

The scorer and normalizer are pure functions. PostgreSQL is the system of record. `pg` uses a connection pool, and the importer commits each row’s deduplication, lead insert, and score together so a failed score cannot leave a partial lead behind.

## Run locally

Prerequisites: Node.js 18+ and PostgreSQL 14+.

```bash
cd backend
npm ci
createdb saasquatch_leads

# Create backend/.env with DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD.
npm run db:migrate
npm run db:seed
npm run dev
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` to `http://localhost:3000`.

## Run with Docker

Docker Compose starts PostgreSQL, runs migrations, seeds four ICP presets, and loads/scored the 240-row demo pipeline before serving the app.

```bash
docker compose up --build
```

Open `http://localhost:5173`. The backend is also available at `http://localhost:3000`.

The seed is idempotent: restarting the stack keeps the demo pipeline at 240 leads. To start over with an empty database, remove the Compose volume explicitly:

```bash
docker compose down -v
```

Use `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `BACKEND_PORT`, or `FRONTEND_PORT` in a local `.env` to override the development defaults. Do not use the bundled password outside local development.

## Quality checks

```bash
cd backend
npm test

# Regenerate the deterministic demo CSV fixtures after editing the generator.
npm run datasets

# Requires PostgreSQL and a seeded ICP.
npm run benchmark

cd ../frontend
npm run build
npm run lint
```

The current pure benchmark result on the bundled 240-row labeled file is 100% exact priority accuracy and 100% Precision@10. The CLI benchmark also checks the database connection before running.

## API surface

- `GET /health`
- `GET /api/icp`
- `POST /api/icp`
- `POST /api/leads/import`
- `GET /api/jobs/:id`
- `GET /api/leads`
- `GET /api/leads/:id`
- `POST /api/leads/:id/score`
- `GET /api/leads/export`

Lead list filters include `q`, `priority`, `minScore`, `maxScore`, `country`, `industry`, `hasEmail`, and `hasDecisionMaker`.

## Deliberate POC limits

- No authentication or multi-tenant isolation.
- CSV rows are parsed into memory; this is appropriate for the demo’s 10 MB upload limit, not unlimited production ingestion.
- Background jobs run in-process. A production deployment should move work to a durable queue such as SQS, BullMQ, or Cloud Tasks.
- Email and website checks are syntax-level checks, not deliverability or uptime verification.
- The benchmark labels are a starting point; production calibration should use sales outcomes such as reply, meeting, and opportunity rates.

## Suggested deployment

For a small demo, deploy the React build as a static site on Vercel or Netlify, the Express API on Render/Fly.io/Railway, and PostgreSQL on Neon or Supabase. Set the frontend API proxy or `VITE_API_BASE_URL` to the deployed API, restrict CORS to the frontend origin, and store uploads in object storage rather than local disk.

# Backend

Express 5 API for SaaSQuatch Lead Intelligence. It owns PostgreSQL persistence, file imports, normalization, duplicate auditing, explainable scoring, job progress, and CSV export.

## Commands

```bash
npm ci
npm run db:migrate
npm run db:seed
npm run dev
npm test
npm run datasets
npm run benchmark
```

The root `docker-compose.yml` runs the backend with PostgreSQL, automatically applies migrations, and runs `npm run db:seed` before starting the API. The seed creates four ICP presets and imports/scored the 240-row `benchmark/sample_labeled.csv` demo pipeline.

Create `.env` in this directory:

```env
NODE_ENV=development
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=saasquatch_leads
DB_USER=postgres
DB_PASSWORD=
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
```

## Services

- `normalizer.js` converts common lead-file formats to canonical values.
- `deduplicator.js` matches by domain first, then normalized company name, and records conflicts.
- `scorer.js` returns overall score, ICP fit, outreach readiness, priority, and human-readable reasons. Employee and revenue ranges award 75% or 50% partial credit for near-misses; related industries and single technology overlaps also receive partial credit.
- `importer.js` processes each row in a transaction and updates `processing_runs` as it goes.
- `exporter.js` streams the current ranked score for each lead as CSV.
- `benchmark.js` compares predictions with labeled rows without touching the database.

There is intentionally no web scraper in this version. The demo’s source of truth is the uploaded lead list; this avoids pretending that search results contain verified employee, revenue, or contact data.

## Routes

- `GET /health`
- `GET /api/icp`
- `POST /api/icp`
- `POST /api/leads/import`
- `GET /api/jobs/:id`
- `GET /api/leads`
- `GET /api/leads/:id`
- `POST /api/leads/:id/score`
- `GET /api/leads/export`

`GET /api/leads` accepts `q`, `priority`, `minScore`, `maxScore`, `country`, `industry`, `hasEmail`, and `hasDecisionMaker`.

## Demo datasets

The deterministic generator is `benchmark/generate-datasets.js`. Run `npm run datasets` to regenerate these fixtures:

- `benchmark/sample_labeled.csv` — 240 labeled rows covering exact fits, near-range accounts, adjacent industries, wrong geographies, missing firmographics, sparse records, and other scoring bands.
- `benchmark/datasets/datasets_partial_scores.csv` — 120 import-ready rows designed to show graded employee, revenue, industry, and technology scores.
- `benchmark/datasets/datasets_messy_crm_export.csv` — 180 rows using alternate headers and messy formats such as `50-200`, `1.5k`, `$12M`, `US`, and invalid emails.
- `benchmark/datasets/datasets_duplicate_conflicts.csv` — 70 rows containing 30 originals, domain duplicates, company-name duplicates, field conflicts, and invalid identity rows.

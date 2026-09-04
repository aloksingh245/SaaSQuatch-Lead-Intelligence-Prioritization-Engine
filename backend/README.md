# SaaSQuatch Lead Intelligence & Prioritization Engine (Backend)

> **Proof of Concept (POC) for Caprae Capital**  
> An automated lead ingestion, normalization, deduplication, and scoring engine built with Node.js, Express, and PostgreSQL.

---

## 📌 Overview

The backend ingests raw, messy B2B lead datasets (CSV / Excel), cleans and normalizes all fields into canonical data types, eliminates duplicate entries, and scores leads from **0 to 100** against configurable **Ideal Customer Profiles (ICP)** with transparent, human-readable explanations.

---

## 🚀 Features

- **Messy Data Normalization:** Standardizes company domains, revenue ranges (e.g. `"$5M-$10M"` $\rightarrow$ `7,500,000`), employee counts (`"50-200"` $\rightarrow$ `125`), country aliases, industry classifications, and email validity.
- **Robust Deduplication:** Prevents duplicate lead creation matching on domain and normalized legal company names while recording an audit log in `duplicate_log`.
- **ICP Scoring & Prioritization:** 100-point deterministic scoring algorithm with partial credit for near-miss ranges (`HIGH`, `MEDIUM`, `LOW`, `VERY_LOW`).
- **Asynchronous Batch Import Jobs:** Background processing for large lead uploads with progress tracking and error reporting.
- **RESTful API & Filtered CSV Export:** Query, paginate, filter by score/priority, and stream filtered results directly to CSV.
- **Benchmarking Engine:** Built-in accuracy test comparing algorithmic scoring against human-labeled benchmark datasets.

---

## 🛠 Tech Stack

- **Runtime:** Node.js (v18+)
- **Framework:** Express 5
- **Database:** PostgreSQL (with `pg` connection pooling)
- **File Parsing & Streaming:** `csv-parse`, `csv-stringify`, `xlsx`, `multer`
- **Validation:** `validator`
- **Testing:** Jest, Supertest

---

## 📁 Project Structure

```
backend/
├── benchmark/
│   ├── run.js                  # CLI benchmark runner
│   └── sample_labeled.csv      # Human-labeled ground truth dataset
├── src/
│   ├── db/
│   │   ├── migrate.js          # PostgreSQL schema migration (6 tables)
│   │   ├── pool.js             # Database connection pool manager
│   │   └── seed.js             # Default Demo ICP seeder
│   ├── routes/
│   │   ├── icp.js              # ICP Profile endpoints
│   │   ├── jobs.js             # Async import job status endpoints
│   │   └── leads.js            # Lead listing, upload, export, & scoring endpoints
│   ├── services/
│   │   ├── benchmark.js        # Benchmark scoring & metrics evaluator
│   │   ├── deduplicator.js     # Deduplication logic & audit logger
│   │   ├── exporter.js         # Streaming CSV generator
│   │   ├── importer.js         # Asynchronous batch file parser & processor
│   │   ├── normalizer.js       # Pure data transformation & cleaning functions
│   │   └── scorer.js           # 100-point ICP scoring algorithm
│   └── server.js               # Express application entrypoint
├── tests/                      # Unit & integration test suites
├── .env                        # Environment configuration
├── package.json
└── README.md
```

---

## ⚙️ Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [PostgreSQL](https://www.postgresql.org/) running locally or remotely

### 2. Environment Setup
Create a `.env` file in the `backend/` root:

```env
NODE_ENV=development
PORT=3000

# PostgreSQL Connection
DB_HOST=localhost
DB_PORT=5432
DB_NAME=saasquatch_leads
DB_USER=postgres
DB_PASSWORD=

# Upload Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
```

### 3. Initialize Database
Create the database in PostgreSQL, run migrations, and insert the demo ICP profile:

```bash
# 1. Create database in Postgres (if not exists)
createdb saasquatch_leads

# 2. Run migrations (creates tables & indexes)
npm run db:migrate

# 3. Seed default Demo ICP Profile
npm run db:seed
```

### 4. Start Server

```bash
# Development (with file watcher)
npm run dev

# Production
npm start
```
Server runs on: **`http://localhost:3000`**  
Health check: **`http://localhost:3000/health`**

---

## 📚 API Reference

### 1. Ideal Customer Profile (ICP)
- `GET /api/icp` — Fetch active ICP profile.
- `POST /api/icp` — Create or update ICP profile.

### 2. Leads Management
- `POST /api/leads/import` — Upload a `.csv` or `.xlsx` file (`multipart/form-data` with `file` and `icpId`). Returns `{ jobId }`.
- `GET /api/leads` — List leads with pagination & filters (`priority`, `minScore`, `country`, `page`, `limit`).
- `GET /api/leads/:id` — Get full lead details including score X-ray breakdown and explanation reasons.
- `GET /api/leads/export` — Stream filtered leads as downloadable CSV.
- `POST /api/leads/:id/score` — Re-score a single lead against an ICP.

### 3. Jobs (Import Polling)
- `GET /api/jobs/:id` — Check import progress (`pending`, `processing`, `done`, `error`), rows imported, duplicates skipped, and errors.

---

## 🧪 Testing & Quality Assurance

### Run Unit & Integration Tests
```bash
npm test
```

### Run Accuracy Benchmark
Compare the scoring algorithm against 50+ human-labeled leads:
```bash
# Human-readable report with confusion matrix & accuracy
npm run benchmark

# JSON output
npm run benchmark:json
```

---

## ⚖️ Scoring Formula (100 Points Total)

| Factor | Weight | Notes |
| :--- | :--- | :--- |
| **Industry Fit** | **25 pts** | Exact match with target industry keywords |
| **Employee Range** | **20 pts** | Full points if in range; partial credit (10 pts) for ≤ 25% near-miss |
| **Revenue Fit** | **15 pts** | Full points if in range; partial credit (8 pts) for ≤ 25% near-miss |
| **Geography** | **10 pts** | Target country match |
| **Technology Match** | **10 pts** | Tech stack overlap (CRM, AWS, Salesforce, etc.) |
| **Website Reachability** | **5 pts** | Valid URL |
| **Email Validity** | **5 pts** | RFC-compliant business email |
| **Decision Maker** | **5 pts** | Contact person / title identified |
| **Growth Trigger** | **5 pts** | LinkedIn URL or expansion signals |

### Priority Thresholds:
- **`HIGH`**: 80 – 100
- **`MEDIUM`**: 60 – 79
- **`LOW`**: 40 – 59
- **`VERY_LOW`**: 0 – 39

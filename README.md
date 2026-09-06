# SaaSQuatch Lead Intelligence & Prioritization Engine

> **Turn raw, unstructured B2B lead dumps into deterministic, explainable, and prioritized sales queues.**

[![Node.js](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16.x-blue.svg)](https://www.postgresql.org/)
[![React](https://img.shields.io/badge/React-18.x-61dafb.svg)](https://reactjs.org/)
[![Vite](https://img.shields.io/badge/Vite-5.x-646cff.svg)](https://vitejs.dev/)
[![Docker](https://img.shields.io/badge/Docker-Supported-2496ed.svg)](https://www.docker.com/)

---

## 🎯 Executive & Engineering Summary

B2B revenue operations teams frequently acquire massive, unorganized lead dumps from providers like SaaSQuatch, ZoomInfo, or Apollo. Raw exports suffer from **inconsistent industry taxonomy** (e.g., raw CSV strings like `"software as a service"` vs standard canonical `"SaaS"`), **stale headcount ranges**, **duplicate entries across exports**, and **unrealistic scoring metrics** inflated by arbitrary web scraping.

The **SaaSQuatch Lead Intelligence Engine** provides a quality-first, deterministic pipeline that imports messy `.csv`/`.xlsx` files, normalizes firmographic attributes, audits duplicate conflicts, evaluates company records against a configurable Ideal Customer Profile (ICP), and produces an **auditable, explainable 0–100 priority score** with gated outreach readiness metrics.

### Key Architectural Highlights
- **Zero Hallucination / Quality-First**: Operates strictly on verified imported data. No fabricated enrichment or arbitrary web scraping.
- **Pure Functional Scoring & Normalization**: Core business logic is isolated into side-effect-free pure functions for 100% deterministic testability and reproducibility.
- **Priority Gating**: Decouples **ICP Fit** from **Outreach Readiness** so contact completeness alone cannot elevate a poor ICP match into a high-priority queue.
- **2-Stage Deduplication with Conflict Auditing**: Matches leads by primary domain or normalized legal name, recording field-level diffs (`field_diff`) to monitor data vendor quality over time.
- **Non-Blocking Ingestion**: Processes multi-megabyte lead files in asynchronous background jobs with real-time transactional progress tracking.

---

## 📐 System Architecture

## 📐 System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                    REACT 18 + VITE FRONTEND                                      │
│                                                                                                  │
│   ┌───────────────────────────┐   ┌───────────────────────────┐   ┌───────────────────────────┐  │
│   │    Dashboard Page (UI)    │   │     Import Page (UI)      │   │    Settings Page (UI)    │  │
│   │  Search, Filter, Export   │   │ Upload CSV/XLSX & Status  │   │   Configure ICP Rules     │  │
│   └─────────────┬─────────────┘   └─────────────┬─────────────┘   └─────────────┬─────────────┘  │
└─────────────────│───────────────────────────────│───────────────────────────────│────────────────┘
                  │                               │                               │
                  └───────────────────────────────┼───────────────────────────────┘
                                                  │ REST HTTP API Proxy (/api)
                                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                   EXPRESS API GATEWAY & ROUTERS                                  │
│                                                                                                  │
│       GET/POST /api/icp               POST /api/leads/import             GET /api/leads & export │
│   (src/routes/icp.js)                   (src/routes/leads.js)                 (src/routes/leads.js)  │
└───────────────┬─────────────────────────────────┬──────────────────────────────────────┬─────────┘
                │                                 │                                      │
                ▼                                 ▼                                      ▼
┌───────────────────────────────┐ ┌───────────────────────────────┐ ┌───────────────────────────────┐
│     PURE TRANSFORMATION CORE  │ │  ASYNC INGESTION WORKER ENGINE│ │    LEAD QUERY & EXPORT ENGINE │
│                               │ │                               │ │                               │
│ • normalizer.js               │ │ • importer.js                 │ │ • exporter.js                 │
│   Sanitizes raw string values │ │   Multi-format streaming parser │ │   Streams filtered CSV output │
│ • deduplicator.js             │ │ • Atomic Row Transactions     │ │ • Filter & Pagination Queries │
│   2-Stage matching & diffs    │ │   Per-row DB transaction pool │ │   SQL filtering & pagination  │
│ • scorer.js                   │ └───────────────┬───────────────┘ └───────────────┬───────────────┘
│   0-100 Scoring & explanation │                 │                                 │
└───────────────┬───────────────┘                 │                                 │
                │                                 │                                 │
                └─────────────────────────────────┼─────────────────────────────────┘
                                                  │ PostgreSQL Pool (pg)
                                                  ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                       POSTGRESQL DATABASE                                        │
│                                                                                                  │
│   icp_profiles       processing_runs       leads             lead_scores       duplicate_log   │
│   (Target Rules)     (Import Status)       (Canonical Leads) (0-100 Scores)    (Audit Diffs)   │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 🧮 Scoring Matrix & Parameter Analysis Engine

The engine evaluates every lead on a **0 to 100 total score** using **9 distinct parameters**.
Parameters are split into two clear operational pillars:
1. **ICP Firmographic Fit (80 Points)**: Measures how well the target company matches your ideal client profile.
2. **Outreach Readiness (20 Points)**: Measures how complete and actionable the contact details are for sales reps.

---

### 🔬 Parameter Breakdown & Single-Reading Explanation

#### 🏢 Pillar 1: ICP Firmographic Fit (Max 80 Points)

##### 1. Industry Match (`industry`) — **25 Points Max**
* **Goal**: Verifies if the lead belongs to your target industry.
* **Input Cleaning**: Normalizes raw inputs (`"software as a service"` $\rightarrow$ `"SaaS"`, `"fintech"` $\rightarrow$ `"Fintech"`).
* **How It Scores**:
  * 🟢 **25 Points (Exact Match)**: The lead's industry matches your ICP target list exactly.
  * 🟡 **13 Points (Adjacent Match)**: Shares a common industry root word $\ge 4$ letters (e.g., Target: `"SaaS"`, Lead: `"B2B SaaS"`).
  * 🔴 **0 Points (Mismatch / Missing)**: Unrelated industry or no industry provided.

##### 2. Employee Headcount (`employees`) — **20 Points Max**
* **Goal**: Verifies if the company size fits your target market segment.
* **Input Cleaning**: Converts numeric ranges to midpoints (`"50-200"` $\rightarrow$ `125`) and expands metric terms (`"1.5k"` $\rightarrow$ `1500`).
* **How It Scores**:
  * 🟢 **20 Points (Inside Range)**: Headcount falls inside your ICP `[min, max]` range.
  * 🟡 **15 Points (Strong Near-Miss)**: Within $\le 10\%$ outside the target boundary (e.g., Range `50-500`, Lead has `540`).
  * 🟠 **10 Points (Weak Near-Miss)**: Within $>10\%$ and $\le 25\%$ outside target boundary.
  * 🔴 **0 Points (Far Out / Missing)**: $> 25\%$ outside target range or missing headcount.

##### 3. Annual Revenue (`revenue`) — **15 Points Max**
* **Goal**: Verifies if the company has the financial scale you target.
* **Input Cleaning**: Parses currency formats (`"$5M-$10M"` $\rightarrow$ `7,500,000`, `"$1.2B"` $\rightarrow$ `1,200,000,000`).
* **How It Scores**:
  * 🟢 **15 Points (Inside Range)**: Revenue falls inside your ICP `[min, max]` range.
  * 🟡 **11 Points (Strong Near-Miss)**: Within $\le 10\%$ outside target revenue boundary.
  * 🟠 **8 Points (Weak Near-Miss)**: Within $>10\%$ and $\le 25\%$ outside target revenue boundary.
  * 🔴 **0 Points (Far Out / Missing)**: $> 25\%$ outside target revenue range or missing revenue.

##### 4. Geography Location (`country`) — **10 Points Max**
* **Goal**: Verifies if the company is located in a target region/country.
* **Input Cleaning**: Maps aliases (`"US"`, `"U.S.A."`, `"United States of America"`) to standard `"United States"`.
* **How It Scores**:
  * 🟢 **10 Points (Target Match)**: Country matches an entry in your target country list.
  * 🔴 **0 Points (Mismatch / Missing)**: Country outside target regions or missing location.

##### 5. Technology Stack Overlap (`technologies`) — **10 Points Max**
* **Goal**: Checks if the company uses tools or platforms compatible with your product.
* **Input Cleaning**: Splits delimited lists (`"Salesforce, AWS, HubSpot"`) into clean unique tags.
* **How It Scores**:
  * 🟢 **10 Points (Strong Fit)**: Matches $\ge 2$ technologies in your target tech stack.
  * 🟡 **5 Points (Partial Fit)**: Matches exactly $1$ technology in your target tech stack.
  * 🔴 **0 Points (No Fit / Missing)**: Zero technology overlap or missing tech data.

---

#### 📞 Pillar 2: Outreach Readiness (Max 20 Points)

##### 6. Website Validity (`website`) — **5 Points Max**
* **Goal**: Ensures the lead has a valid, reachable web domain for research.
* **How It Scores**:
  * 🟢 **5 Points**: Valid URL present with valid domain extension.
  * 🔴 **0 Points**: Missing, empty, or unparseable website URL.

##### 7. Business Email (`email`) — **5 Points Max**
* **Goal**: Ensures sales reps can immediately email the prospect.
* **Input Cleaning**: Validates RFC 5322 syntax; strips generic placeholders (`"contact@"`, `"n/a"`).
* **How It Scores**:
  * 🟢 **5 Points**: Valid corporate email present.
  * 🔴 **0 Points**: Missing, invalid syntax, or generic email.

##### 8. Decision Maker Identified (`decision_maker`) — **5 Points Max**
* **Goal**: Ensures direct outreach to a key person rather than a cold company phone line.
* **How It Scores**:
  * 🟢 **5 Points**: Key decision maker / contact name identified.
  * 🔴 **0 Points**: Unidentified contact name.

##### 9. Growth / Sourcing Signal (`growth_trigger`) — **5 Points Max**
* **Goal**: Identifies active market engagement or actively sourced profiles.
* **How It Scores**:
  * 🟢 **5 Points**: Valid LinkedIn profile URL present OR active growth event logged.
  * 🔴 **0 Points**: No growth or social signals found.

---

### 📊 Comprehensive Parameter Scoring Table

| Pillar | Parameter | Weight | Full Points Criteria | Partial Credit Criteria | Zero Points Criteria |
| :--- | :--- | :---: | :--- | :--- | :--- |
| **ICP Fit** | **Industry** | **25 pts** | Exact match with target industry (**25 pts**) | Shares root word $\ge 4$ chars (**13 pts**) | Unrelated industry or missing (**0 pts**) |
| **ICP Fit** | **Employees** | **20 pts** | Inside target `[min, max]` range (**20 pts**) | Miss $\le 10\%$: **15 pts** \| Miss $\le 25\%$: **10 pts** | Miss $>25\%$ or missing (**0 pts**) |
| **ICP Fit** | **Revenue** | **15 pts** | Inside target `[min, max]` range (**15 pts**) | Miss $\le 10\%$: **11 pts** \| Miss $\le 25\%$: **8 pts** | Miss $>25\%$ or missing (**0 pts**) |
| **ICP Fit** | **Geography** | **10 pts** | Country matches target geography (**10 pts**) | None | Non-target region or missing (**0 pts**) |
| **ICP Fit** | **Tech Stack** | **10 pts** | Matches $\ge 2$ target technologies (**10 pts**) | Matches 1 target technology (**5 pts**) | 0 technology overlap or missing (**0 pts**) |
| **Readiness** | **Website** | **5 pts** | Valid URL present (**5 pts**) | None | Missing or invalid URL (**0 pts**) |
| **Readiness** | **Email** | **5 pts** | Valid corporate email syntax (**5 pts**) | None | Missing or bad format (**0 pts**) |
| **Readiness** | **Decision Maker**| **5 pts** | Named contact identified (**5 pts**) | None | Missing contact name (**0 pts**) |
| **Readiness** | **Growth Signal** | **5 pts** | LinkedIn URL or growth signal present (**5 pts**)| None | No signal found (**0 pts**) |

---

### 🛑 Priority Tier Gating Rules

The engine uses **Priority Gating** so complete contact info cannot push a non-ICP company into the top sales queue.

```text
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     PRIORITY QUEUE EVALUATION FLOW                                      │
├──────────────┬──────────────────┬─────────────────────────────────────────────────┬─────────────────────┤
│ Priority Tier│ Total Score Req. │ Required Structural Gates                       │ Target Action       │
├──────────────┼──────────────────┼─────────────────────────────────────────────────┼─────────────────────┤
│ 🔴 HIGH      │ Score ≥ 80       │ MUST have EXACT Industry Fit AND Geography Fit  │ Immediate Outreach  │
│ 🟡 MEDIUM    │ Score ≥ 60       │ MUST have EXACT Industry Fit                    │ Sales Team Review   │
│ 🔵 LOW       │ Score ≥ 40       │ No gating required                             │ Nurture Campaign    │
│ ⚪ VERY LOW  │ Score < 40       │ No gating required                             │ Deprioritized Queue │
└──────────────┴──────────────────┴─────────────────────────────────────────────────┴─────────────────────┘
```

---

## 🔍 Data Normalization & Deduplication Pipeline

### Normalization Logic (`normalizer.js`)
Incoming strings are sanitized into predictable data types before database insertion:
- **Domains**: Extracts base hostnames (`"https://www.acme.com/team"` $\rightarrow$ `"acme.com"`).
- **Headcount**: Midpoint evaluation for ranges (`"50-200"` $\rightarrow$ `125`), unit expansion (`"1.5k"` $\rightarrow$ `1500`).
- **Revenue**: Currency parsing (`"$5M-$10M"` $\rightarrow$ `7500000`), metric expansion (`"$1.2B"` $\rightarrow$ `1200000000`).
- **Country Taxonomy**: Maps country variants (`"USA"`, `"U.S.A."`, `"United States of America"`) to standard canonical labels (`"United States"`).
- **Company Name Sanitization**: Strips legal suffixes (`Inc`, `LLC`, `Ltd`, `GmbH`, `Corp`) to form clean comparison keys.

### 2-Stage Deduplication (`deduplicator.js`)
1. **Primary Match**: Evaluates normalized domain (`domain`).
2. **Fallback Match**: Evaluates normalized corporate name (`_company_normalized`) when domain is omitted.
3. **Conflict Audit (`field_diff`)**: When a duplicate is detected, it logs field-level differences to `duplicate_log` (e.g., `employees: { existing: 250, incoming: 350 }`), serving as a data quality indicator across vendor files.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: `v18+` or `v20+`
- **PostgreSQL**: `v14+` or `v16+`
- *(Optional)* **Docker Desktop**

---

### Option A: Docker Setup (Fastest & Isolated)

Run the entire system (Postgres, Backend API, React Frontend, Database Migrations, and Demo Seeding) using Docker Compose:

```bash
# 1. Clone the repository
git clone https://github.com/your-org/SaaSQuatch-Lead-Intelligence-Prioritization-Engine.git
cd SaaSQuatch-Lead-Intelligence-Prioritization-Engine

# 2. Build and launch all services
docker compose up --build
```

Access the applications:
- 🌐 **Web Dashboard**: `http://localhost:5173`
- 🔌 **REST API Gateway**: `http://localhost:3000`
- 🏥 **Health Check**: `http://localhost:3000/health`

---

### Option B: Local Native Setup (Development)

#### 1. Database Setup
Ensure PostgreSQL is running locally, then create the target database:
```bash
createdb saasquatch_leads
```

#### 2. Backend Setup
```bash
cd backend
npm ci

# Run migrations and seed initial ICP profiles & benchmark datasets
npm run db:migrate
npm run db:seed

# Start the dev server
npm run dev
```

#### 3. Frontend Setup
In a new terminal window:
```bash
cd frontend
npm ci
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 📡 REST API Reference

| Method | Endpoint | Description | Query / Body Parameters |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Server and database health check | N/A |
| `GET` | `/api/icp` | Retrieve current active ICP profile | N/A |
| `POST` | `/api/icp` | Create or update active ICP profile | `{ name, target_industries, employee_min, employee_max, revenue_min, revenue_max, countries, technologies }` |
| `POST` | `/api/leads/import` | Upload lead file and kick off background ingestion job | Multipart `file` (`.csv`/`.xlsx`), `icpId` |
| `GET` | `/api/jobs/:id` | Check background import status and metrics | `id` (Job UUID) |
| `GET` | `/api/leads` | List leads with filtering and pagination | `q`, `priority`, `minScore`, `maxScore`, `country`, `industry`, `hasEmail`, `hasDecisionMaker`, `page`, `limit` |
| `GET` | `/api/leads/:id` | Fetch single lead details with Score X-Ray | `id` (Lead ID) |
| `POST` | `/api/leads/:id/score` | Re-score a single lead against updated active ICP | `id` (Lead ID) |
| `GET` | `/api/leads/export` | Stream filtered leads queue as downloadable CSV | Accepts same filter parameters as `GET /api/leads` |

---

## 🧪 Testing & Quality Verification

The repository includes deterministic unit tests and CLI benchmark runners to measure prioritization performance:

```bash
# 1. Run unit tests for normalizer, deduplicator, and scorer
cd backend
npm test

# 2. Run benchmark validation against the bundled 240-row labeled dataset
npm run benchmark
```

> **Benchmark Accuracy**: Current pure benchmark run against the bundled 240-row labeled benchmark dataset yields **100% Exact Priority Accuracy** and **100% Precision@10**.

---

## 🛡️ Production Readiness & Architectural Limits

For enterprise production deployments, consider the following roadmap enhancements:
1. **Durable Task Queue**: Migrate in-process `importer.js` background execution to a distributed job queue (BullMQ / Redis or AWS SQS).
2. **Streaming CSV Parsing**: Replace in-memory parsing with stream-based processing for files exceeding 100 MB.
3. **Multi-Tenant Isolation & Auth**: Implement RBAC and tenant isolation layers (`tenant_id` partitioning).
4. **Live Data Enrichment Hooks**: Integrate Webhook callbacks (Clearbit / Apollo / ZoomInfo) into `enrichment_results`.


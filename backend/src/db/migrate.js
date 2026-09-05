/**
 * Database migration script.
 * Run via: npm run db:migrate
 * Creates all 6 entities (5 core + duplicate_log for data quality).
 * Safe to re-run (IF NOT EXISTS on tables).
 */
'use strict';

require('dotenv').config();
const pool = require('./pool');

const DDL = `
-- 1. ICP Profiles
CREATE TABLE IF NOT EXISTS icp_profiles (
  id               SERIAL PRIMARY KEY,
  name             TEXT        NOT NULL,
  target_industries TEXT[]     NOT NULL DEFAULT '{}',
  employee_min     INTEGER,
  employee_max     INTEGER,
  revenue_min      NUMERIC(18,2),
  revenue_max      NUMERIC(18,2),
  countries        TEXT[]      NOT NULL DEFAULT '{}',
  technologies     TEXT[]      NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Processing runs (import jobs)
CREATE TABLE IF NOT EXISTS processing_runs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','processing','done','error')),
  total_rows       INTEGER     NOT NULL DEFAULT 0,
  imported         INTEGER     NOT NULL DEFAULT 0,
  duplicates       INTEGER     NOT NULL DEFAULT 0,
  failures         INTEGER     NOT NULL DEFAULT 0,
  error_detail     JSONB,
  started_at       TIMESTAMPTZ,
  finished_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Leads
CREATE TABLE IF NOT EXISTS leads (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name     TEXT        NOT NULL,
  domain           TEXT,
  industry         TEXT,
  employees        INTEGER,
  revenue          NUMERIC(18,2),
  country          TEXT,
  technologies     TEXT[]      NOT NULL DEFAULT '{}',
  email            TEXT,
  linkedin_url     TEXT,
  decision_maker   TEXT,
  website          TEXT,
  raw_data         JSONB,
  processing_run_id UUID       REFERENCES processing_runs(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_domain_uniq
  ON leads (domain)
  WHERE domain IS NOT NULL AND domain <> '';

CREATE INDEX IF NOT EXISTS leads_industry_idx  ON leads (industry);
CREATE INDEX IF NOT EXISTS leads_country_idx   ON leads (country);
CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC);

-- 4. Lead scores
CREATE TABLE IF NOT EXISTS lead_scores (
  id               SERIAL      PRIMARY KEY,
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  total_score      INTEGER     NOT NULL DEFAULT 0,
  fit_score        INTEGER     NOT NULL DEFAULT 0,
  readiness_score  INTEGER     NOT NULL DEFAULT 0,
  priority         TEXT        NOT NULL DEFAULT 'VERY_LOW'
                               CHECK (priority IN ('HIGH','MEDIUM','LOW','VERY_LOW')),
  component_scores JSONB       NOT NULL DEFAULT '{}',
  explanation      JSONB       NOT NULL DEFAULT '{}',
  icp_profile_id   INTEGER     REFERENCES icp_profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Safe upgrades for databases created by earlier POC versions.
ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS fit_score INTEGER NOT NULL DEFAULT 0;
ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS readiness_score INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS lead_scores_lead_id_idx ON lead_scores (lead_id);
CREATE INDEX IF NOT EXISTS lead_scores_total_idx   ON lead_scores (total_score DESC);
CREATE INDEX IF NOT EXISTS lead_scores_priority_idx ON lead_scores (priority);

-- 5. Enrichment results
CREATE TABLE IF NOT EXISTS enrichment_results (
  id               SERIAL      PRIMARY KEY,
  lead_id          UUID        NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  source           TEXT        NOT NULL,
  model_version    TEXT,
  fields           JSONB       NOT NULL DEFAULT '{}',
  checked_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (lead_id, source)
);

-- 6. Duplicate log — data quality tracking
-- One row per CSV row that was skipped as a duplicate.
-- Captures WHY it was a duplicate and what was DIFFERENT
-- so you can audit data source quality over time.
CREATE TABLE IF NOT EXISTS duplicate_log (
  id                  SERIAL      PRIMARY KEY,
  processing_run_id   UUID        NOT NULL REFERENCES processing_runs(id),
  row_number          INTEGER     NOT NULL,             -- line number in the CSV
  raw_company_name    TEXT,                             -- what the CSV said
  raw_domain          TEXT,                             -- what the CSV domain was
  match_reason        TEXT        NOT NULL              -- 'domain' or 'company_name'
                      CHECK (match_reason IN ('domain','company_name')),
  matched_lead_id     UUID        NOT NULL REFERENCES leads(id),
  field_diff          JSONB       NOT NULL DEFAULT '{}', -- fields that DIFFER vs existing lead
  raw_data            JSONB       NOT NULL DEFAULT '{}', -- full raw CSV row for audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dup_log_run_idx    ON duplicate_log (processing_run_id);
CREATE INDEX IF NOT EXISTS dup_log_lead_idx   ON duplicate_log (matched_lead_id);
CREATE INDEX IF NOT EXISTS dup_log_reason_idx ON duplicate_log (match_reason);
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('[migrate] Running DDL …');
    await client.query(DDL);
    console.log('[migrate] Done. All tables created/verified.');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();

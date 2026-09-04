/**
 * Deduplicator — src/services/deduplicator.js
 *
 * PURPOSE: Before inserting a normalized lead, check if it already exists
 * in the database. If it does, build a full duplicate record for the log.
 *
 * TWO-SIGNAL MATCHING (in priority order):
 *   1. domain      — strongest signal. "acme.com" uniquely identifies a company.
 *   2. company_name — fallback when domain is missing. Fuzzy-ish: normalized form.
 *
 * WHY domain first?
 * A company can rename itself. "Acme Corp" → "Acme Technologies".
 * But their domain stays "acme.com" for years. Domain is more stable.
 *
 * WHY not both together as AND?
 * Because real CSV data is inconsistent. One row has the domain, another
 * has only the company name. OR-logic catches both cases.
 *
 * DATA QUALITY: buildFieldDiff()
 * When a duplicate is found, we compare its normalized values to the
 * existing lead's stored values. Any field that differs goes into field_diff.
 * This is your window into data source quality:
 *   - Same company, different employee count → source has stale data
 *   - Same domain, different industry label → source uses inconsistent taxonomy
 */

'use strict';

const pool = require('../db/pool');

// Fields we compare when building a field diff.
// These are the fields that matter for scoring — if they differ, the data
// quality of your source is in question.
const COMPARABLE_FIELDS = [
  'company_name',
  'industry',
  'employees',
  'revenue',
  'country',
  'email',
  'website',
  'decision_maker',
];

/**
 * Check whether a normalized lead already exists in the database.
 *
 * @param {Object} normalizedLead   — output of normalizer.normalizeRow()
 * @param {Object} client           — pg client (passed in so we stay in same transaction)
 * @returns {{ exists: boolean, existingLead: Object|null, matchReason: string|null }}
 */
async function findDuplicate(normalizedLead, client) {
  const db = client || pool;

  // Signal 1: domain match (strongest)
  if (normalizedLead.domain) {
    const res = await db.query(
      'SELECT * FROM leads WHERE domain = $1 LIMIT 1',
      [normalizedLead.domain]
    );
    if (res.rowCount > 0) {
      return {
        exists: true,
        existingLead: res.rows[0],
        matchReason: 'domain',
      };
    }
  }

  // Signal 2: normalized company name (fallback when domain is missing)
  if (normalizedLead._company_normalized) {
    // We store the display name in DB — so we normalize the DB value at query time.
    // This is a text search, not an index scan, but it's a fallback path (rare).
    const res = await db.query(
      `SELECT * FROM leads
       WHERE LOWER(REGEXP_REPLACE(
               REGEXP_REPLACE(company_name, '\\m(inc|llc|ltd|limited|corp|corporation|plc|gmbh|sas|bv|ag)\\M', '', 'gi'),
               '[,\\.\\-]', ' ', 'g'
             )) = $1
       LIMIT 1`,
      [normalizedLead._company_normalized]
    );
    if (res.rowCount > 0) {
      return {
        exists: true,
        existingLead: res.rows[0],
        matchReason: 'company_name',
      };
    }
  }

  return { exists: false, existingLead: null, matchReason: null };
}

/**
 * Compare a normalized incoming lead to an existing DB lead.
 * Returns only the fields that DIFFER — this is the data quality signal.
 *
 * @param {Object} incoming    — normalized lead from normalizeRow()
 * @param {Object} existing    — row from leads table
 * @returns {Object}           — { fieldName: [existingValue, incomingValue] }
 *
 * Example output:
 *   {
 *     employees: [250, 300],
 *     revenue:   [5000000, 8000000],
 *     email:     ['old@acme.com', 'new@acme.com']
 *   }
 */
function buildFieldDiff(incoming, existing) {
  const diff = {};

  for (const field of COMPARABLE_FIELDS) {
    const inVal  = incoming[field] ?? null;
    const exVal  = existing[field] ?? null;

    // Arrays (technologies) — compare as sorted JSON strings
    if (Array.isArray(inVal) || Array.isArray(exVal)) {
      const inStr = JSON.stringify((inVal || []).slice().sort());
      const exStr = JSON.stringify((exVal || []).slice().sort());
      if (inStr !== exStr) {
        diff[field] = { existing: exVal, incoming: inVal };
      }
      continue;
    }

    // Numbers — compare numerically (avoid string vs number false positives)
    if (typeof inVal === 'number' || typeof exVal === 'number') {
      const inNum = inVal != null ? Number(inVal) : null;
      const exNum = exVal != null ? Number(exVal) : null;
      if (inNum !== exNum) {
        diff[field] = { existing: exVal, incoming: inVal };
      }
      continue;
    }

    // Strings — case-insensitive comparison (avoids "Acme" vs "acme" false diffs)
    const inStr = inVal != null ? String(inVal).toLowerCase().trim() : null;
    const exStr = exVal != null ? String(exVal).toLowerCase().trim() : null;
    if (inStr !== exStr) {
      diff[field] = { existing: exVal, incoming: inVal };
    }
  }

  return diff;
}

/**
 * Write a duplicate record to the duplicate_log table.
 *
 * @param {Object} params
 * @param {string} params.processingRunId
 * @param {number} params.rowNumber          — 1-based row index in the CSV
 * @param {Object} params.normalizedLead     — the incoming (duplicate) lead
 * @param {Object} params.existingLead       — the lead it matched against
 * @param {string} params.matchReason        — 'domain' or 'company_name'
 * @param {Object} params.rawRow             — original raw CSV row
 * @param {Object} [client]                  — optional pg client for transactions
 */
async function logDuplicate(
  { processingRunId, rowNumber, normalizedLead, existingLead, matchReason, rawRow },
  client
) {
  const db = client || pool;
  const fieldDiff = buildFieldDiff(normalizedLead, existingLead);

  await db.query(
    `INSERT INTO duplicate_log
       (processing_run_id, row_number, raw_company_name, raw_domain,
        match_reason, matched_lead_id, field_diff, raw_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      processingRunId,
      rowNumber,
      normalizedLead.company_name,
      normalizedLead.domain,
      matchReason,
      existingLead.id,
      JSON.stringify(fieldDiff),
      JSON.stringify(rawRow),
    ]
  );

  return fieldDiff;
}

/**
 * Query duplicate log for a given processing run.
 * Used by the API to return data quality stats after an import.
 *
 * @param {string} processingRunId
 * @returns {Object} summary + rows
 */
async function getDuplicateSummary(processingRunId) {
  // Total count + breakdown by match reason
  const countRes = await pool.query(
    `SELECT
       COUNT(*)                                              AS total,
       COUNT(*) FILTER (WHERE match_reason = 'domain')      AS by_domain,
       COUNT(*) FILTER (WHERE match_reason = 'company_name') AS by_name,
       COUNT(*) FILTER (WHERE field_diff != '{}')            AS with_diff
     FROM duplicate_log
     WHERE processing_run_id = $1`,
    [processingRunId]
  );

  // Individual duplicate rows for the API response
  const rowsRes = await pool.query(
    `SELECT
       dl.id,
       dl.row_number,
       dl.raw_company_name,
       dl.raw_domain,
       dl.match_reason,
       dl.matched_lead_id,
       dl.field_diff,
       dl.created_at,
       l.company_name  AS matched_company_name
     FROM duplicate_log dl
     JOIN leads l ON l.id = dl.matched_lead_id
     WHERE dl.processing_run_id = $1
     ORDER BY dl.row_number ASC`,
    [processingRunId]
  );

  const counts = countRes.rows[0];
  return {
    total:           parseInt(counts.total, 10),
    byDomain:        parseInt(counts.by_domain, 10),
    byCompanyName:   parseInt(counts.by_name, 10),
    withFieldDiffs:  parseInt(counts.with_diff, 10),    // ← your data quality number
    rows:            rowsRes.rows,
  };
}

module.exports = {
  findDuplicate,
  buildFieldDiff,
  logDuplicate,
  getDuplicateSummary,
};

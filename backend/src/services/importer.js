/**
 * Importer — src/services/importer.js
 *
 * PURPOSE: Parse an uploaded CSV or Excel file, normalize each row,
 * deduplicate, save leads, and score them — all in the background.
 *
 * FLOW:
 *   importFile(filePath, icpId)
 *     → creates processing_run { status: 'pending' }
 *     → returns runId immediately (HTTP response goes out)
 *     → kicks off processFile() in background (no await)
 *
 *   processFile(runId, filePath, icpId)
 *     → for each row:
 *         1. normalizeRow()
 *         2. findDuplicate() → if dup: logDuplicate(), skip
 *         3. INSERT into leads
 *         4. scoreLead() → INSERT into lead_scores
 *     → marks run as 'done' or 'error' when finished
 *
 * ERROR POLICY:
 *   - Per-row errors → logged to processing_run.error_detail[], row skipped
 *   - File-level errors → run marked 'error' with reason
 *   - Background errors NEVER crash the server process
 */

'use strict';

const fs            = require('fs');
const path          = require('path');
const { parse }     = require('csv-parse');
const XLSX          = require('xlsx');
const pool          = require('../db/pool');
const { normalizeRow }    = require('./normalizer');
const { findDuplicate, logDuplicate } = require('./deduplicator');
const { scoreLead }       = require('./scorer');

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Start an async import job.
 *
 * Creates a processing_run record, returns its ID immediately,
 * then processes the file in the background.
 *
 * @param {string} filePath  — absolute path to the uploaded file
 * @param {number} icpId     — ID of the ICP profile to score against
 * @returns {Promise<string>} runId — UUID of the processing_run
 */
async function importFile(filePath, icpId) {
  // Step 1: Create the run record synchronously so we have an ID to return
  const res = await pool.query(
    `INSERT INTO processing_runs (status)
     VALUES ('pending')
     RETURNING id`
  );
  const runId = res.rows[0].id;

  // Step 2: Kick off background processing WITHOUT awaiting it.
  // setImmediate() lets the current call stack finish (HTTP response goes out)
  // before the background work starts.
  setImmediate(() => {
    processFile(runId, filePath, icpId).catch((err) => {
      // Last-resort handler — marks the run as failed if processFile itself throws
      console.error(`[importer] Unhandled error in run ${runId}:`, err.message);
      pool.query(
        `UPDATE processing_runs
         SET status = 'error',
             error_detail = $2,
             finished_at  = NOW()
         WHERE id = $1`,
        [runId, JSON.stringify({ message: err.message })]
      ).catch(() => {}); // swallow DB errors here — we're already in a failure path
    });
  });

  return runId;
}

// ─────────────────────────────────────────────────────────────────────────────
// BACKGROUND PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The actual import logic — runs entirely in the background.
 *
 * @param {string} runId
 * @param {string} filePath
 * @param {number} icpId
 */
async function processFile(runId, filePath, icpId) {
  // Mark run as started
  await pool.query(
    `UPDATE processing_runs
     SET status = 'processing', started_at = NOW()
     WHERE id = $1`,
    [runId]
  );

  // Load the ICP profile once (not per-row — that would be thousands of DB calls)
  const icpRes = await pool.query('SELECT * FROM icp_profiles WHERE id = $1', [icpId]);
  if (icpRes.rowCount === 0) {
    throw new Error(`ICP profile ${icpId} not found`);
  }
  const icp = icpRes.rows[0];
  // Map DB snake_case arrays to what scorer expects
  icp.target_industries = icp.target_industries || [];
  icp.technologies      = icp.technologies      || [];
  icp.countries         = icp.countries         || [];

  // Parse the file into raw rows
  const rawRows = await parseFile(filePath);

  // Counters
  let imported   = 0;
  let duplicates = 0;
  let failures   = 0;
  const rowErrors = [];

  // Process rows one at a time (not in parallel — avoids race conditions on
  // the unique domain index and keeps memory flat for large files)
  for (let i = 0; i < rawRows.length; i++) {
    const rowNumber = i + 1; // 1-based for human readability
    const rawRow    = rawRows[i];

    try {
      await processRow({
        rawRow,
        rowNumber,
        runId,
        icp,
      });
      imported++;
    } catch (err) {
      // Is it a duplicate we already handled?
      if (err.code === 'DUPLICATE_SKIPPED') {
        duplicates++;
      } else {
        failures++;
        rowErrors.push({ rowNumber, error: err.message });
        console.warn(`[importer] run=${runId} row=${rowNumber} error:`, err.message);
      }
    }
  }

  // Clean up the uploaded file (we don't need it anymore)
  try { fs.unlinkSync(filePath); } catch (_) {}

  // Mark run as done
  await pool.query(
    `UPDATE processing_runs
     SET status      = 'done',
         total_rows  = $2,
         imported    = $3,
         duplicates  = $4,
         failures    = $5,
         error_detail = $6,
         finished_at  = NOW()
     WHERE id = $1`,
    [
      runId,
      rawRows.length,
      imported,
      duplicates,
      failures,
      rowErrors.length > 0 ? JSON.stringify(rowErrors) : null,
    ]
  );

  console.log(
    `[importer] run=${runId} done — rows=${rawRows.length} ` +
    `imported=${imported} dupes=${duplicates} failures=${failures}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROW PROCESSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Process a single raw CSV row end-to-end:
 *   normalize → deduplicate → insert lead → score → insert score
 *
 * Throws a coded error for duplicates (caller increments the right counter).
 */
async function processRow({ rawRow, rowNumber, runId, icp }) {
  // 1. Normalize
  const normalized = normalizeRow(rawRow);

  // Guard: skip rows with no identifiable company
  if (!normalized.company_name && !normalized.domain) {
    throw new Error(`Row ${rowNumber}: no company name or domain — skipping`);
  }

  // 2. Deduplicate (uses a pool connection internally)
  const { exists, existingLead, matchReason } = await findDuplicate(normalized);

  if (exists) {
    // Log the duplicate for data quality tracking, then signal the caller
    await logDuplicate({
      processingRunId: runId,
      rowNumber,
      normalizedLead:  normalized,
      existingLead,
      matchReason,
      rawRow,
    });
    const err = new Error(`Duplicate: matched existing lead ${existingLead.id} by ${matchReason}`);
    err.code = 'DUPLICATE_SKIPPED';
    throw err;
  }

  // 3. Insert the lead
  const leadRes = await pool.query(
    `INSERT INTO leads
       (company_name, domain, industry, employees, revenue, country,
        technologies, email, linkedin_url, decision_maker, website,
        raw_data, processing_run_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      normalized.company_name,
      normalized.domain,
      normalized.industry,
      normalized.employees,
      normalized.revenue,
      normalized.country,
      normalized.technologies,
      normalized.email,
      normalized.linkedin_url,
      normalized.decision_maker,
      normalized.website,
      JSON.stringify(rawRow),
      runId,
    ]
  );

  const leadId = leadRes.rows[0].id;

  // 4. Score the lead (pure function — no DB)
  const scored = scoreLead({ ...normalized, id: leadId }, icp);

  // 5. Save the score
  await pool.query(
    `INSERT INTO lead_scores
       (lead_id, total_score, priority, component_scores, explanation, icp_profile_id)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      leadId,
      scored.score,
      scored.priority,
      JSON.stringify(scored.componentScores),
      JSON.stringify({ leadId, score: scored.score, priority: scored.priority, reasons: scored.reasons }),
      icp.id,
    ]
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE PARSING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parse a CSV or Excel file into an array of raw row objects.
 * Column names become object keys (trimmed, original case preserved —
 * the normalizer handles column name variants).
 *
 * @param {string} filePath
 * @returns {Promise<Object[]>} raw rows
 */
async function parseFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.csv') {
    return parseCsv(filePath);
  }

  if (ext === '.xlsx' || ext === '.xls') {
    return parseExcel(filePath);
  }

  throw new Error(`Unsupported file type: ${ext}. Use .csv, .xlsx, or .xls`);
}

/**
 * Parse a CSV file using csv-parse's streaming API.
 * Returns all rows as an array (held in memory — fine for POC scale).
 */
function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const parser = parse({
      columns: true,            // first row = column headers
      skip_empty_lines: true,
      trim: true,               // trim whitespace from each cell
      relax_quotes: true,       // tolerate messy CSV quoting
      relax_column_count: true, // don't crash on ragged rows
    });

    parser.on('readable', () => {
      let record;
      while ((record = parser.read()) !== null) {
        rows.push(record);
      }
    });

    parser.on('error', (err) => reject(new Error(`CSV parse error: ${err.message}`)));
    parser.on('end', () => resolve(rows));

    fs.createReadStream(filePath).pipe(parser);
  });
}

/**
 * Parse an Excel file using the xlsx library.
 * Converts the first sheet to CSV-style row objects.
 */
function parseExcel(filePath) {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];     // always take the first sheet
  const sheet = workbook.Sheets[sheetName];

  // header: 1 → first row becomes the keys
  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: null,               // missing cells → null (not undefined)
    raw: false,                 // all values as strings (normalizer handles types)
  });

  return rows;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch a processing_run by ID.
 * Used by the jobs route to check status.
 *
 * @param {string} runId
 * @returns {Object|null}
 */
async function getRunStatus(runId) {
  const res = await pool.query(
    `SELECT
       id, status,
       total_rows, imported, duplicates, failures,
       error_detail,
       started_at, finished_at, created_at,
       EXTRACT(EPOCH FROM (COALESCE(finished_at, NOW()) - started_at))::INT AS elapsed_seconds
     FROM processing_runs
     WHERE id = $1`,
    [runId]
  );
  return res.rowCount > 0 ? res.rows[0] : null;
}

module.exports = {
  importFile,
  getRunStatus,
  // Exported for testing
  _internal: { parseFile, parseCsv, parseExcel, processRow },
};

/**
 * Routes: Jobs — src/routes/jobs.js
 *
 * GET /api/jobs/:id
 *   Poll the status of an import job (processing_run).
 *   Returns progress counters + duplicate quality summary when done.
 */

'use strict';

const express = require('express');
const { getRunStatus }        = require('../services/importer');
const { getDuplicateSummary } = require('../services/deduplicator');

const pool = require('../db/pool');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs
// List recent import runs for dataset segregation dropdown
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (_req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, status, total_rows, imported, duplicates, failures, created_at, error_detail
       FROM processing_runs
       WHERE status = 'done'
       ORDER BY created_at DESC
       LIMIT 20`
    );
    return res.json(result.rows);
  } catch (err) {
    console.error('[GET /jobs]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/jobs/:id
//
// Response while running:
//   { status: 'processing', imported: 42, total_rows: 200, ... }
//
// Response when done:
//   { status: 'done', imported: 155, duplicates: 45, failures: 0,
//     elapsed_seconds: 4,
//     duplicateQuality: { total: 45, byDomain: 38, byCompanyName: 7, withFieldDiffs: 12, rows: [...] }
//   }
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const run = await getRunStatus(req.params.id);

    if (!run) {
      return res.status(404).json({ error: `Job ${req.params.id} not found.` });
    }

    const response = { ...run };

    // Include the full duplicate quality breakdown only when the job is complete
    if (run.status === 'done' && run.duplicates > 0) {
      response.duplicateQuality = await getDuplicateSummary(run.id);
    }

    return res.json(response);
  } catch (err) {
    console.error('[GET /jobs/:id]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

/**
 * Routes: Leads — src/routes/leads.js
 *
 * Handles:
 *   POST   /api/leads/import      upload CSV → start async job
 *   GET    /api/leads             list leads with filters + pagination
 *   GET    /api/leads/export      stream filtered leads as CSV
 *   GET    /api/leads/:id         lead detail + score explanation
 *   POST   /api/leads/:id/score   re-score a single lead
 *
 * WHY export before :id?
 * Express matches routes top-to-bottom. If :id came first,
 * "export" would be treated as a lead ID and fail.
 */

'use strict';

const express  = require('express');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const pool     = require('../db/pool');
const { importFile }       = require('../services/importer');
const { exportLeadsCsv }   = require('../services/exporter');
const { scoreLead }        = require('../services/scorer');
const { getDuplicateSummary } = require('../services/deduplicator');

const router = express.Router();

// ─── Multer setup (file upload) ───────────────────────────────────────────────

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    // Unique filename: timestamp + original name (sanitized)
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext     = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/import
//
// Upload a CSV/Excel file. Starts async processing. Returns jobId.
//
// Body (multipart/form-data):
//   file   — the CSV or Excel file
//   icpId  — integer ID of the ICP profile to score against
// ─────────────────────────────────────────────────────────────────────────────

router.post('/import', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded. Send a file field named "file".' });
    }

    const icpId = parseInt(req.body.icpId, 10);
    if (!icpId || isNaN(icpId)) {
      fs.unlinkSync(req.file.path); // clean up orphaned upload
      return res.status(400).json({ error: 'icpId is required and must be an integer.' });
    }

    // Verify ICP exists before we start the job
    const icpCheck = await pool.query('SELECT id FROM icp_profiles WHERE id = $1', [icpId]);
    if (icpCheck.rowCount === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: `ICP profile ${icpId} not found.` });
    }

    const runId = await importFile(req.file.path, icpId);

    return res.status(202).json({
      message: 'Import started. Poll /api/jobs/:id for progress.',
      jobId:   runId,
    });
  } catch (err) {
    console.error('[POST /leads/import]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads/export
//
// Stream ranked leads as a downloadable CSV.
//
// Query params (all optional):
//   priority   — HIGH | MEDIUM | LOW | VERY_LOW
//   minScore   — number
//   maxScore   — number
//   country    — string
//   industry   — string
// ─────────────────────────────────────────────────────────────────────────────

router.get('/export', async (req, res) => {
  try {
    const filters = {
      priority:  req.query.priority,
      minScore:  req.query.minScore,
      maxScore:  req.query.maxScore,
      country:   req.query.country,
      industry:  req.query.industry,
      q:         req.query.q,
      hasEmail:  req.query.hasEmail,
      hasDecisionMaker: req.query.hasDecisionMaker,
    };
    await exportLeadsCsv(res, filters);
  } catch (err) {
    console.error('[GET /leads/export]', err.message);
    // Only send error if headers not already sent (streaming may have started)
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads
//
// List leads ranked by score, with filters and pagination.
//
// Query params:
//   priority   — HIGH | MEDIUM | LOW | VERY_LOW
//   minScore   — number
//   maxScore   — number
//   country    — string
//   industry   — string
//   page       — integer (default 1)
//   limit      — integer (default 20, max 100)
// ─────────────────────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const page  = parsePositiveInt(req.query.page, 1);
    const limit = Math.min(100, Math.max(1, parsePositiveInt(req.query.limit, 20)));
    const offset = (page - 1) * limit;

    const conditions = [];
    const values     = [];
    let   idx        = 1;

    if (req.query.priority) {
      const priority = String(req.query.priority).toUpperCase();
      if (!['HIGH', 'MEDIUM', 'LOW', 'VERY_LOW'].includes(priority)) {
        return res.status(400).json({ error: 'Invalid priority filter.' });
      }
      conditions.push(`ls.priority = $${idx++}`);
      values.push(priority);
    }
    if (req.query.minScore != null) {
      const minScore = parseScore(req.query.minScore, 'minScore');
      conditions.push(`ls.total_score >= $${idx++}`);
      values.push(minScore);
    }
    if (req.query.maxScore != null) {
      const maxScore = parseScore(req.query.maxScore, 'maxScore');
      conditions.push(`ls.total_score <= $${idx++}`);
      values.push(maxScore);
    }
    if (req.query.country) {
      conditions.push(`LOWER(l.country) = LOWER($${idx++})`);
      values.push(req.query.country);
    }
    if (req.query.industry) {
      conditions.push(`LOWER(l.industry) = LOWER($${idx++})`);
      values.push(req.query.industry);
    }
    if (req.query.q) {
      conditions.push(`(l.company_name ILIKE $${idx} OR l.domain ILIKE $${idx})`);
      values.push(`%${String(req.query.q).trim()}%`);
      idx++;
    }
    if (req.query.hasEmail === 'true') conditions.push(`NULLIF(l.email, '') IS NOT NULL`);
    if (req.query.hasEmail === 'false') conditions.push(`NULLIF(l.email, '') IS NULL`);
    if (req.query.hasDecisionMaker === 'true') conditions.push(`NULLIF(l.decision_maker, '') IS NOT NULL`);
    if (req.query.hasDecisionMaker === 'false') conditions.push(`NULLIF(l.decision_maker, '') IS NULL`);

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

    const countRes = await pool.query(
      `SELECT COUNT(*) FROM leads l
       JOIN LATERAL (
         SELECT total_score, priority, fit_score, readiness_score
         FROM lead_scores WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
       ) ls ON TRUE ${where}`,
      values
    );
    const total = parseInt(countRes.rows[0].count, 10);

    const dataRes = await pool.query(
      `SELECT
         l.id, l.company_name, l.domain, l.industry, l.employees,
         l.revenue, l.country, l.technologies, l.email,
         l.website, l.decision_maker, l.linkedin_url, l.created_at,
         ls.total_score, ls.fit_score, ls.readiness_score, ls.priority
       FROM leads l
       JOIN LATERAL (
         SELECT total_score, priority, fit_score, readiness_score
         FROM lead_scores WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
       ) ls ON TRUE
       ${where}
       ORDER BY ls.total_score DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    const summaryRes = await pool.query(
      `SELECT
         COUNT(*)::INT AS total,
         COUNT(*) FILTER (WHERE ls.priority = 'HIGH')::INT AS high,
         COUNT(*) FILTER (WHERE ls.priority = 'MEDIUM')::INT AS medium,
         COUNT(*) FILTER (WHERE ls.priority = 'LOW')::INT AS low,
         COUNT(*) FILTER (WHERE ls.priority = 'VERY_LOW')::INT AS very_low,
         COUNT(*) FILTER (WHERE NULLIF(l.email, '') IS NOT NULL)::INT AS contactable
       FROM leads l
       JOIN LATERAL (
         SELECT priority FROM lead_scores
         WHERE lead_id = l.id ORDER BY created_at DESC LIMIT 1
       ) ls ON TRUE`
    );

    return res.json({
      data:       dataRes.rows,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      summary:    summaryRes.rows[0],
    });
  } catch (err) {
    console.error('[GET /leads]', err.message);
    return res.status(err.status || 500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leads/:id
//
// Full lead detail including score breakdown and explanation.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const leadRes = await pool.query(
      `SELECT
         l.*,
         ls.total_score, ls.priority, ls.component_scores,
         ls.fit_score, ls.readiness_score, ls.explanation, ls.created_at AS scored_at,
         ls.icp_profile_id
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT * FROM lead_scores
         WHERE lead_id = l.id
         ORDER BY created_at DESC
         LIMIT 1
       ) ls ON TRUE
       WHERE l.id = $1`,
      [req.params.id]
    );

    if (leadRes.rowCount === 0) {
      return res.status(404).json({ error: `Lead ${req.params.id} not found.` });
    }

    return res.json(leadRes.rows[0]);
  } catch (err) {
    console.error('[GET /leads/:id]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leads/:id/score
//
// Re-calculate a lead's score (e.g., after ICP profile changes).
// Uses the ICP profile that originally scored it, or a new icpId from body.
//
// Body (optional JSON):
//   { "icpId": 2 }
// ─────────────────────────────────────────────────────────────────────────────

router.post('/:id/score', async (req, res) => {
  try {
    // Fetch the lead
    const leadRes = await pool.query('SELECT * FROM leads WHERE id = $1', [req.params.id]);
    if (leadRes.rowCount === 0) {
      return res.status(404).json({ error: `Lead ${req.params.id} not found.` });
    }
    const lead = leadRes.rows[0];

    // Determine which ICP to use
    let icpId = req.body?.icpId;
    if (!icpId) {
      // Fall back to the profile that last scored this lead
      const lastScore = await pool.query(
        'SELECT icp_profile_id FROM lead_scores WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
        [lead.id]
      );
      icpId = lastScore.rows[0]?.icp_profile_id;
    }
    if (!icpId) {
      return res.status(400).json({ error: 'No icpId provided and no previous score found.' });
    }

    const icpRes = await pool.query('SELECT * FROM icp_profiles WHERE id = $1', [icpId]);
    if (icpRes.rowCount === 0) {
      return res.status(404).json({ error: `ICP profile ${icpId} not found.` });
    }
    const icp = icpRes.rows[0];

    // Re-score (pure function)
    const scored = scoreLead(lead, icp);

    // Save new score record (keeps history — doesn't overwrite old scores)
    await pool.query(
      `INSERT INTO lead_scores
         (lead_id, total_score, fit_score, readiness_score, priority,
          component_scores, explanation, icp_profile_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        lead.id,
        scored.score,
        scored.fitScore,
        scored.readinessScore,
        scored.priority,
        JSON.stringify(scored.componentScores),
        JSON.stringify({ leadId: lead.id, score: scored.score, priority: scored.priority, reasons: scored.reasons }),
        icp.id,
      ]
    );

    return res.json({
      leadId:   lead.id,
      score:    scored.score,
      fitScore: scored.fitScore,
      readinessScore: scored.readinessScore,
      priority: scored.priority,
      reasons:  scored.reasons,
    });
  } catch (err) {
    console.error('[POST /leads/:id/score]', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

function parsePositiveInt(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    const error = new Error('Pagination values must be positive integers.');
    error.status = 400;
    throw error;
  }
  return parsed;
}

function parseScore(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    const error = new Error(`${label} must be a number between 0 and 100.`);
    error.status = 400;
    throw error;
  }
  return parsed;
}

/**
 * server.js — Entry point
 *
 * Boots Express, mounts routes, starts listening.
 *
 * WHY is this file so small?
 * Because ALL logic lives in services/ and routes/.
 * This file's only job is wiring — nothing more.
 * A file that does too many things is impossible to debug.
 */

'use strict';

require('dotenv').config();

const express = require('express');
const morgan  = require('morgan');
const path    = require('path');
const fs      = require('fs');

// ─── Route modules ────────────────────────────────────────────────────────────
const leadsRouter = require('./routes/leads');
const jobsRouter  = require('./routes/jobs');
const icpRouter   = require('./routes/icp');

// ─── App setup ────────────────────────────────────────────────────────────────
const app  = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

// HTTP request logger — tiny format in prod, dev format in dev
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));

// JSON body parser — needed for POST /api/icp and POST /api/leads/:id/score
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Ensure uploads directory exists at startup
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// Health check — a simple endpoint that confirms the server is alive.
// Used by load balancers, monitoring tools, and your own sanity.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
});

// Mount route modules at their base paths
app.use('/api/leads', leadsRouter);
app.use('/api/jobs',  jobsRouter);
app.use('/api/icp',   icpRouter);

// 404 handler — catches any route not matched above
app.use((_req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

// Global error handler — last-resort catch for unhandled errors in route handlers
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server] Unhandled error:', err.message);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

// Only start listening if this file is run directly (not required by tests)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`[server] SaaSQuatch Lead Intelligence API running on http://localhost:${PORT}`);
    console.log(`[server] Health check: http://localhost:${PORT}/health`);
  });
}

// Export app for supertest in integration tests
module.exports = app;

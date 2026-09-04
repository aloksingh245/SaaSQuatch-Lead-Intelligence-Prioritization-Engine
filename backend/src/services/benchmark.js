/**
 * Benchmark Service — src/services/benchmark.js
 *
 * ONE JOB: Take labeled leads + ICP → return metrics.
 *
 * LABELING CONTRACT:
 *   - human_label column filled by analyst (or by us for the POC sample)
 *   - Rows with no label → EXCLUDED, counted, warned about. Never guessed.
 *   - Zero labeled rows → hard error.
 *
 * LABELING CRITERIA (our domain-knowledge rules for the POC sample):
 *   HIGH     = SaaS/Software + employees 50–500 + United States
 *   MEDIUM   = SaaS/Software + (wrong size OR not US)
 *   LOW      = Non-SaaS + right size + US
 *   VERY_LOW = Wrong industry + wrong size, or near-empty data
 *
 *   These rules are SIMPLER than the scoring engine on purpose.
 *   The gap between them is what the benchmark measures.
 *
 * PURE — no DB, no file I/O, no side effects.
 */

'use strict';

const { scoreLead } = require('./scorer');

const PRIORITIES     = ['HIGH', 'MEDIUM', 'LOW', 'VERY_LOW'];
const POSITIVE_CLASS = 'HIGH'; // class used for Precision@K

// ─── Public ──────────────────────────────────────────────────────────────────

/**
 * Run the full benchmark.
 *
 * @param {Array<{ lead: Object, humanLabel: string|null }>} rows
 * @param {Object} icp
 * @returns {Object} result
 */
function runBenchmark(rows, icp) {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error('rows must be a non-empty array.');
  }

  // Split labeled vs unlabeled
  const labeled   = [];
  const skipped   = [];

  for (const r of rows) {
    const label = normalizeLabel(r.humanLabel);
    if (label === null) {
      skipped.push(r.lead?.company_name || r.lead?.domain || '(unknown)');
    } else {
      labeled.push({ lead: r.lead, humanLabel: label });
    }
  }

  if (labeled.length === 0) {
    throw new Error(
      `Zero labeled rows in ${rows.length} total.\n` +
      `Add a "human_label" column with: ${PRIORITIES.join(' | ')}.`
    );
  }

  if (skipped.length > 0) {
    console.warn(
      `[benchmark] ${labeled.length}/${rows.length} rows labeled. ` +
      `${skipped.length} excluded (no label).`
    );
  }

  // Score every labeled lead and track per-call latency
  const latencies = [];
  const wall0     = Date.now();

  const scored = labeled.map(({ lead, humanLabel }) => {
    const t0  = process.hrtime.bigint();
    const out = scoreLead(lead, icp);
    const t1  = process.hrtime.bigint();

    latencies.push(Number(t1 - t0) / 1e6); // ns → ms

    return {
      company:        lead.company_name || lead.domain || '(unknown)',
      humanLabel,
      engineScore:    out.score,
      enginePriority: out.priority,
      match:          humanLabel === out.priority,
      reasons:        out.reasons,
    };
  });

  const wallMs      = Date.now() - wall0;
  const byScore     = [...scored].sort((a, b) => b.engineScore - a.engineScore);

  return {
    timestamp:        new Date().toISOString(),
    totalInputRows:   rows.length,
    labeledRows:      labeled.length,
    skippedRows:      skipped.length,
    skippedCompanies: skipped,
    metrics: {
      accuracy:      accuracy(scored),
      precisionAt10: precisionAtK(byScore, 10),
      precisionAt20: precisionAtK(byScore, 20),
    },
    latency: {
      totalMs:   wallMs,
      perLeadMs: r3(wallMs / scored.length),
      p50Ms:     pct(latencies, 50),
      p95Ms:     pct(latencies, 95),
      p99Ms:     pct(latencies, 99),
    },
    confusionMatrix: confusion(scored),
    breakdown:       byScore,
  };
}

// ─── Metrics ─────────────────────────────────────────────────────────────────

function accuracy(scored) {
  if (!scored.length) return 0;
  return r4(scored.filter(s => s.match).length / scored.length);
}

function precisionAtK(ranked, k) {
  const top = ranked.slice(0, Math.min(k, ranked.length));
  if (!top.length) return 0;
  return r4(top.filter(s => s.humanLabel === POSITIVE_CLASS).length / top.length);
}

function confusion(scored) {
  const m = {};
  for (const h of PRIORITIES) {
    m[h] = {};
    for (const e of PRIORITIES) m[h][e] = 0;
  }
  for (const s of scored) {
    if (m[s.humanLabel]?.[s.enginePriority] !== undefined) {
      m[s.humanLabel][s.enginePriority]++;
    }
  }
  return m;
}

// ─── Label normalizer ─────────────────────────────────────────────────────────
// Returns null → EXCLUDE this row. Never guesses. Never defaults.

function normalizeLabel(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (s === 'VERY_LOW' || s === 'VERY LOW') return 'VERY_LOW';
  if (PRIORITIES.includes(s)) return s;
  console.warn(`[benchmark] Unknown label "${raw}" — row excluded.`);
  return null;
}

// ─── Report ───────────────────────────────────────────────────────────────────

function formatReport(res) {
  const { metrics: m, latency: l, confusionMatrix: cm, breakdown } = res;
  const pct = n => `${(n * 100).toFixed(1)}%`;
  const ln  = '─'.repeat(58);

  let o = `\n${ln}\n  SAASQUATCH BENCHMARK — ${res.timestamp}\n${ln}\n\n`;

  o += `  Dataset\n`;
  o += `    Total rows      ${res.totalInputRows}\n`;
  o += `    Labeled         ${res.labeledRows}\n`;
  if (res.skippedRows) o += `    Skipped ⚠       ${res.skippedRows}  (no human_label)\n`;

  o += `\n  METRICS  (on ${res.labeledRows} labeled rows)\n`;
  o += `    Accuracy        ${pct(m.accuracy).padStart(7)}   exact priority match\n`;
  o += `    Precision@10    ${pct(m.precisionAt10).padStart(7)}   HIGH leads in engine top 10\n`;
  o += `    Precision@20    ${pct(m.precisionAt20).padStart(7)}   HIGH leads in engine top 20\n`;

  o += `\n  LATENCY\n`;
  o += `    Total           ${l.totalMs} ms  (${res.labeledRows} leads)\n`;
  o += `    Per lead        ${l.perLeadMs} ms\n`;
  o += `    p50/p95/p99     ${l.p50Ms} / ${l.p95Ms} / ${l.p99Ms} ms\n`;

  o += `\n  CONFUSION MATRIX  (row = human, col = engine)\n\n`;
  o += `                HIGH      MEDIUM    LOW       VERY_LOW\n`;
  for (const h of PRIORITIES) {
    const row = PRIORITIES.map(e => String(cm[h][e]).padEnd(10)).join('');
    o += `  ${h.padEnd(14)}${row}\n`;
  }

  o += `\n  TOP 10 BY ENGINE SCORE\n`;
  o += `  ${'Company'.padEnd(30)} ${'Label'.padEnd(10)} Engine     Sc  ✓/✗\n`;
  for (const r of breakdown.slice(0, 10)) {
    o += `  ${r.company.slice(0,29).padEnd(30)} `;
    o += `${r.humanLabel.padEnd(10)} `;
    o += `${r.enginePriority.padEnd(11)} `;
    o += `${String(r.engineScore).padStart(3)}  ${r.match ? '✓' : '✗'}\n`;
  }

  if (res.skippedRows) {
    o += `\n  ⚠ ${res.skippedRows} rows excluded — add human_label to improve coverage.\n`;
  }

  o += `\n${ln}\n`;
  return o;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const r3 = n => Math.round(n * 1e3) / 1e3;
const r4 = n => Math.round(n * 1e4) / 1e4;

function pct(arr, p) {
  if (!arr.length) return 0;
  const s   = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.ceil((p / 100) * s.length) - 1);
  return r3(s[idx]);
}

module.exports = {
  runBenchmark,
  formatReport,
  _internal: { accuracy, precisionAtK, confusion, normalizeLabel },
};

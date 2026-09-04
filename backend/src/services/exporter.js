/**
 * Exporter — src/services/exporter.js
 *
 * PURPOSE: Query ranked/filtered leads from DB and stream them as a CSV.
 *
 * WHY stream instead of building a big string?
 * For thousands of leads, building a string in memory could hit Node's
 * memory limits. Streaming writes each row directly to the HTTP response,
 * so memory stays flat regardless of file size.
 */

'use strict';

const { stringify } = require('csv-stringify');
const pool          = require('../db/pool');

// Columns that appear in the exported CSV — in this order
const EXPORT_COLUMNS = [
  { key: 'company_name',   header: 'Company Name'   },
  { key: 'domain',         header: 'Domain'         },
  { key: 'industry',       header: 'Industry'       },
  { key: 'employees',      header: 'Employees'      },
  { key: 'revenue',        header: 'Revenue (USD)'  },
  { key: 'country',        header: 'Country'        },
  { key: 'technologies',   header: 'Technologies'   },
  { key: 'email',          header: 'Email'          },
  { key: 'website',        header: 'Website'        },
  { key: 'decision_maker', header: 'Decision Maker' },
  { key: 'linkedin_url',   header: 'LinkedIn URL'   },
  { key: 'total_score',    header: 'Score'          },
  { key: 'priority',       header: 'Priority'       },
];

/**
 * Stream ranked leads as CSV to an HTTP response.
 *
 * @param {Object} res        — Express response object
 * @param {Object} filters    — { priority, minScore, maxScore, country, industry }
 */
async function exportLeadsCsv(res, filters = {}) {
  // Build the filtered query (same logic as the list leads endpoint)
  const { whereClause, values } = buildWhereClause(filters);

  const query = `
    SELECT
      l.company_name, l.domain, l.industry, l.employees,
      l.revenue, l.country, l.technologies, l.email,
      l.website, l.decision_maker, l.linkedin_url,
      ls.total_score, ls.priority
    FROM leads l
    JOIN lead_scores ls ON ls.lead_id = l.id
    ${whereClause}
    ORDER BY ls.total_score DESC
  `;

  // Set response headers so the browser triggers a file download
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads_ranked.csv"');

  // csv-stringify streams rows directly to res
  const stringifier = stringify({
    header: true,
    columns: EXPORT_COLUMNS.map((c) => ({ key: c.key, header: c.header })),
    cast: {
      // Arrays (technologies) → comma-separated string in CSV
      object: (val) => Array.isArray(val) ? val.join(', ') : String(val ?? ''),
    },
  });

  stringifier.pipe(res);

  // Stream rows from DB into csv-stringify
  const client = await pool.connect();
  try {
    const result = await client.query(query, values);
    for (const row of result.rows) {
      stringifier.write(row);
    }
    stringifier.end();
  } finally {
    client.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function buildWhereClause(filters) {
  const conditions = [];
  const values     = [];
  let   idx        = 1;

  if (filters.priority) {
    conditions.push(`ls.priority = $${idx++}`);
    values.push(filters.priority.toUpperCase());
  }
  if (filters.minScore != null) {
    conditions.push(`ls.total_score >= $${idx++}`);
    values.push(Number(filters.minScore));
  }
  if (filters.maxScore != null) {
    conditions.push(`ls.total_score <= $${idx++}`);
    values.push(Number(filters.maxScore));
  }
  if (filters.country) {
    conditions.push(`LOWER(l.country) = LOWER($${idx++})`);
    values.push(filters.country);
  }
  if (filters.industry) {
    conditions.push(`LOWER(l.industry) = LOWER($${idx++})`);
    values.push(filters.industry);
  }

  const whereClause = conditions.length > 0
    ? 'WHERE ' + conditions.join(' AND ')
    : '';

  return { whereClause, values };
}

module.exports = { exportLeadsCsv };

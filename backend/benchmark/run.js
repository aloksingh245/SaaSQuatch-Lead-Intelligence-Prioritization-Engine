/**
 * Benchmark CLI Runner — benchmark/run.js
 *
 * Usage:
 *   node benchmark/run.js                        (uses sample_labeled.csv + ICP id=1)
 *   node benchmark/run.js --file path/to/my.csv  (custom labeled CSV)
 *   node benchmark/run.js --icp 2                (different ICP profile)
 *   node benchmark/run.js --json                 (output raw JSON instead of report)
 *
 * What it does:
 *   1. Parse the labeled CSV
 *   2. Normalize each row (same normalizer the importer uses)
 *   3. Load the ICP profile from the DB
 *   4. Run the benchmark (score + compare)
 *   5. Print the report (or JSON)
 *   6. Exit 0 = success, 1 = error
 */

'use strict';

require('dotenv').config();

const fs        = require('fs');
const path      = require('path');
const { parse } = require('csv-parse/sync');
const pool      = require('../src/db/pool');
const { normalizeRow }  = require('../src/services/normalizer');
const { runBenchmark, formatReport } = require('../src/services/benchmark');

// ─── CLI args ─────────────────────────────────────────────────────────────────

const args  = process.argv.slice(2);
const flags = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--file') flags.file  = args[++i];
  if (args[i] === '--icp')  flags.icpId = parseInt(args[++i], 10);
  if (args[i] === '--json') flags.json  = true;
}

const csvPath = flags.file
  ? path.resolve(flags.file)
  : path.join(__dirname, 'sample_labeled.csv');

const icpId = flags.icpId || 1;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Verify the CSV file exists
  if (!fs.existsSync(csvPath)) {
    console.error(`[benchmark] File not found: ${csvPath}`);
    process.exit(1);
  }

  console.log(`[benchmark] Loading: ${csvPath}`);
  console.log(`[benchmark] ICP id: ${icpId}`);

  // 2. Parse the CSV
  const raw = fs.readFileSync(csvPath, 'utf8');
  let csvRows;
  try {
    csvRows = parse(raw, {
      columns:           true,
      skip_empty_lines:  true,
      trim:              true,
      relax_quotes:      true,
      relax_column_count: true,
    });
  } catch (err) {
    console.error(`[benchmark] CSV parse error: ${err.message}`);
    process.exit(1);
  }

  console.log(`[benchmark] Parsed ${csvRows.length} rows from CSV`);

  // 3. Extract human_label + normalize the rest
  //    The human_label column is ONLY for the benchmark — it never goes to the DB.
  const rows = csvRows.map((raw) => {
    const humanLabel = raw.human_label || raw['human_label'] || raw['Human Label'] || null;

    // Remove the label column before normalizing so it doesn't confuse the normalizer
    const { human_label: _, 'human_label': __, 'Human Label': ___, ...leadRaw } = raw;

    return {
      lead:       normalizeRow(leadRaw),
      humanLabel,
    };
  });

  // 4. Load the ICP from the DB
  let icp;
  try {
    const res = await pool.query('SELECT * FROM icp_profiles WHERE id = $1', [icpId]);
    if (res.rowCount === 0) {
      console.error(
        `[benchmark] ICP profile id=${icpId} not found.\n` +
        `Run: npm run db:seed   (inserts the Demo ICP as id=1)`
      );
      process.exit(1);
    }
    icp = res.rows[0];
  } catch (err) {
    console.error(
      `[benchmark] Cannot connect to DB: ${err.message}\n` +
      `Check your .env DB_* settings and that PostgreSQL is running.\n` +
      `Run: npm run db:migrate && npm run db:seed`
    );
    process.exit(1);
  } finally {
    await pool.end();
  }

  // 5. Run the benchmark (pure — no DB from here)
  let result;
  try {
    result = runBenchmark(rows, icp);
  } catch (err) {
    console.error(`[benchmark] ${err.message}`);
    process.exit(1);
  }

  // 6. Output
  if (flags.json) {
    // Strip the verbose reasons array to keep JSON compact
    const compact = {
      ...result,
      breakdown: result.breakdown.map(({ reasons: _, ...rest }) => rest),
    };
    console.log(JSON.stringify(compact, null, 2));
  } else {
    console.log(formatReport(result));
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[benchmark] Unexpected error:', err.message);
  process.exit(1);
});

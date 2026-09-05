/**
 * Seed the local/demo database.
 *
 * Safe to re-run: ICP profiles are upserted by name and the bundled demo
 * leads are upserted by domain. This keeps `docker compose up` repeatable
 * without touching leads that came from another source.
 */
'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');
const { normalizeRow } = require('../services/normalizer');
const { scoreLead } = require('../services/scorer');
const { _internal: { parseFile } } = require('../services/importer');

const ICP_PROFILES = [
  {
    name: 'Fintech Expansion ICP',
    target_industries: ['Fintech', 'Financial Technology', 'Payments', 'Banking Software'],
    employee_min: 100,
    employee_max: 1_000,
    revenue_min: 10_000_000,
    revenue_max: 250_000_000,
    countries: ['United States', 'United Kingdom', 'Germany'],
    technologies: ['Stripe', 'Salesforce', 'AWS', 'Snowflake', 'HubSpot'],
  },
  {
    name: 'HealthTech Growth ICP',
    target_industries: ['HealthTech', 'Healthcare Software', 'Digital Health', 'SaaS'],
    employee_min: 75,
    employee_max: 750,
    revenue_min: 8_000_000,
    revenue_max: 150_000_000,
    countries: ['United States', 'Canada', 'United Kingdom'],
    technologies: ['AWS', 'Azure', 'Salesforce', 'Snowflake', 'FHIR'],
  },
  {
    name: 'E-commerce Growth ICP',
    target_industries: ['E-commerce', 'Retail Technology', 'Commerce Software', 'SaaS'],
    employee_min: 50,
    employee_max: 500,
    revenue_min: 5_000_000,
    revenue_max: 100_000_000,
    countries: ['United States', 'United Kingdom', 'Australia'],
    technologies: ['Shopify', 'Salesforce', 'HubSpot', 'AWS', 'Klaviyo'],
  },
  {
    // Keep the SaaS benchmark ICP last: the GET /api/icp endpoint treats the
    // most recently created profile as the active import profile.
    name: 'Demo B2B SaaS ICP',
    target_industries: ['SaaS', 'B2B SaaS', 'Software', 'Cloud Software'],
    employee_min: 50,
    employee_max: 500,
    revenue_min: 5_000_000,
    revenue_max: 100_000_000,
    countries: ['United States', 'US', 'USA'],
    technologies: ['CRM', 'Salesforce', 'HubSpot', 'cloud', 'AWS', 'GCP', 'Azure', 'sales tooling'],
  },
];

const SAMPLE_FILE = path.resolve(__dirname, '../../benchmark/sample_labeled.csv');

async function upsertIcp(client, icp) {
  const existing = await client.query('SELECT id FROM icp_profiles WHERE name = $1', [icp.name]);
  const values = [
    icp.name,
    icp.target_industries,
    icp.employee_min,
    icp.employee_max,
    icp.revenue_min,
    icp.revenue_max,
    icp.countries,
    icp.technologies,
  ];

  if (existing.rowCount > 0) {
    const updated = await client.query(
      `UPDATE icp_profiles SET
         target_industries = $2, employee_min = $3, employee_max = $4,
         revenue_min = $5, revenue_max = $6, countries = $7, technologies = $8,
         updated_at = NOW()
       WHERE name = $1
       RETURNING *`,
      values
    );
    return updated.rows[0];
  }

  const inserted = await client.query(
    `INSERT INTO icp_profiles
       (name, target_industries, employee_min, employee_max,
        revenue_min, revenue_max, countries, technologies)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     RETURNING *`,
    values
  );
  return inserted.rows[0];
}

async function seedDemoLeads(client, icp) {
  if (!fs.existsSync(SAMPLE_FILE)) {
    throw new Error(`Demo dataset not found at ${SAMPLE_FILE}. Run npm run datasets first.`);
  }

  const rawRows = await parseFile(SAMPLE_FILE);
  const runResult = await client.query(
    `INSERT INTO processing_runs
       (status, total_rows, imported, failures, started_at, finished_at, error_detail)
     VALUES ('done', $1, $1, 0, NOW(), NOW(), $2)
     RETURNING id`,
    [rawRows.length, JSON.stringify({ seed: 'docker-demo', dataset: 'sample_labeled.csv' })]
  );
  const runId = runResult.rows[0].id;
  let imported = 0;

  for (const rawRow of rawRows) {
    const lead = normalizeRow(rawRow);
    if (!lead.domain) continue;

    const leadResult = await client.query(
      `INSERT INTO leads
         (company_name, domain, industry, employees, revenue, country,
          technologies, email, linkedin_url, decision_maker, website,
          raw_data, processing_run_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (domain) WHERE domain IS NOT NULL AND domain <> ''
       DO UPDATE SET
         company_name = EXCLUDED.company_name,
         industry = EXCLUDED.industry,
         employees = EXCLUDED.employees,
         revenue = EXCLUDED.revenue,
         country = EXCLUDED.country,
         technologies = EXCLUDED.technologies,
         email = EXCLUDED.email,
         linkedin_url = EXCLUDED.linkedin_url,
         decision_maker = EXCLUDED.decision_maker,
         website = EXCLUDED.website,
         raw_data = EXCLUDED.raw_data,
         processing_run_id = EXCLUDED.processing_run_id,
         updated_at = NOW()
       RETURNING id`,
      [
        lead.company_name,
        lead.domain,
        lead.industry,
        lead.employees,
        lead.revenue,
        lead.country,
        lead.technologies,
        lead.email,
        lead.linkedin_url,
        lead.decision_maker,
        lead.website,
        JSON.stringify(rawRow),
        runId,
      ]
    );

    const leadId = leadResult.rows[0].id;
    const scored = scoreLead({ ...lead, id: leadId }, icp);

    await client.query('DELETE FROM lead_scores WHERE lead_id = $1', [leadId]);
    await client.query(
      `INSERT INTO lead_scores
         (lead_id, total_score, fit_score, readiness_score, priority,
          component_scores, explanation, icp_profile_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        leadId,
        scored.score,
        scored.fitScore,
        scored.readinessScore,
        scored.priority,
        JSON.stringify(scored.componentScores),
        JSON.stringify({ leadId, score: scored.score, priority: scored.priority, reasons: scored.reasons }),
        icp.id,
      ]
    );
    imported += 1;
  }

  return { imported, total: rawRows.length, runId };
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const profiles = [];
    for (const icp of ICP_PROFILES) profiles.push(await upsertIcp(client, icp));

    const activeIcp = profiles.find((icp) => icp.name === 'Demo B2B SaaS ICP');
    // `NOW()` is transaction-scoped. Use a wall-clock timestamp here so a
    // fresh seed has one unambiguous active profile even when all inserts run
    // inside the same transaction.
    await client.query(
      "UPDATE icp_profiles SET updated_at = clock_timestamp() WHERE name = 'Demo B2B SaaS ICP'"
    );
    const leads = await seedDemoLeads(client, activeIcp);
    await client.query('COMMIT');

    console.log(`[seed] ${profiles.length} ICP profiles ready.`);
    console.log(`[seed] ${leads.imported}/${leads.total} demo leads seeded and scored (run=${leads.runId}).`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[seed] Error:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

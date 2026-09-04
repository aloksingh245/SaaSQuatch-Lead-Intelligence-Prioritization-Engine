/**
 * Seed: inserts the DEMO ICP profile used for benchmarking.
 * Safe to re-run (upserts by name).
 */
'use strict';

require('dotenv').config();
const pool = require('./pool');

const DEMO_ICP = {
  name: 'Demo B2B SaaS ICP',
  target_industries: ['SaaS', 'B2B SaaS', 'Software', 'Cloud Software'],
  employee_min: 50,
  employee_max: 500,
  revenue_min: 5_000_000,
  revenue_max: 100_000_000,
  countries: ['United States', 'US', 'USA'],
  technologies: ['CRM', 'Salesforce', 'HubSpot', 'cloud', 'AWS', 'GCP', 'Azure', 'sales tooling'],
};

async function seed() {
  const client = await pool.connect();
  try {
    const existing = await client.query(
      'SELECT id FROM icp_profiles WHERE name = $1',
      [DEMO_ICP.name]
    );

    if (existing.rowCount > 0) {
      await client.query(
        `UPDATE icp_profiles SET
           target_industries = $2, employee_min = $3, employee_max = $4,
           revenue_min = $5, revenue_max = $6, countries = $7, technologies = $8,
           updated_at = NOW()
         WHERE name = $1`,
        [
          DEMO_ICP.name,
          DEMO_ICP.target_industries,
          DEMO_ICP.employee_min,
          DEMO_ICP.employee_max,
          DEMO_ICP.revenue_min,
          DEMO_ICP.revenue_max,
          DEMO_ICP.countries,
          DEMO_ICP.technologies,
        ]
      );
      console.log('[seed] Demo ICP updated (id=%d).', existing.rows[0].id);
    } else {
      const res = await client.query(
        `INSERT INTO icp_profiles
           (name, target_industries, employee_min, employee_max,
            revenue_min, revenue_max, countries, technologies)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [
          DEMO_ICP.name,
          DEMO_ICP.target_industries,
          DEMO_ICP.employee_min,
          DEMO_ICP.employee_max,
          DEMO_ICP.revenue_min,
          DEMO_ICP.revenue_max,
          DEMO_ICP.countries,
          DEMO_ICP.technologies,
        ]
      );
      console.log('[seed] Demo ICP inserted (id=%d).', res.rows[0].id);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

seed();

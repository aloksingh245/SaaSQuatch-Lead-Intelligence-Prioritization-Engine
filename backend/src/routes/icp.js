const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// GET /api/icp - Get the active ICP profile
router.get('/', async (req, res) => {
  try {
    // The active profile is the one most recently saved, not necessarily the
    // one created last. This keeps seeded presets and user edits consistent.
    const result = await pool.query(
      'SELECT * FROM icp_profiles ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1'
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ICP profile found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/icp - Create the first profile or update the active profile.
// This endpoint deliberately does not scrape the web. Lead discovery is
// handled by the user's imported CSV/XLSX source, keeping the demo honest.
router.post('/', async (req, res) => {
  const {
    name,
    target_industries,
    employee_min,
    employee_max,
    revenue_min,
    revenue_max,
    countries,
    technologies
  } = req.body;

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'Profile name is required' });
  }

  const asNumber = (value, label) => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      const error = new Error(`${label} must be a non-negative number.`);
      error.status = 400;
      throw error;
    }
    return parsed;
  };

  try {
    const employeesMin = asNumber(employee_min, 'Minimum employees');
    const employeesMax = asNumber(employee_max, 'Maximum employees');
    const revenueMin = asNumber(revenue_min, 'Minimum revenue');
    const revenueMax = asNumber(revenue_max, 'Maximum revenue');

    if (employeesMin != null && employeesMax != null && employeesMin > employeesMax) {
      return res.status(400).json({ error: 'Minimum employees cannot exceed maximum employees.' });
    }
    if (revenueMin != null && revenueMax != null && revenueMin > revenueMax) {
      return res.status(400).json({ error: 'Minimum revenue cannot exceed maximum revenue.' });
    }

    const current = await pool.query(
      'SELECT id FROM icp_profiles ORDER BY updated_at DESC, created_at DESC LIMIT 1'
    );

    const values = [
      name.trim(),
      Array.isArray(target_industries) ? target_industries.filter(Boolean) : [],
      employeesMin,
      employeesMax,
      revenueMin,
      revenueMax,
      Array.isArray(countries) ? countries.filter(Boolean) : [],
      Array.isArray(technologies) ? technologies.filter(Boolean) : [],
    ];

    let result;
    let status = 200;
    if (current.rowCount > 0) {
      result = await pool.query(
        `UPDATE icp_profiles SET
           name = $1, target_industries = $2, employee_min = $3, employee_max = $4,
           revenue_min = $5, revenue_max = $6, countries = $7, technologies = $8,
           updated_at = NOW()
         WHERE id = $9
         RETURNING *`,
        [...values, current.rows[0].id]
      );
    } else {
      status = 201;
      result = await pool.query(
        `INSERT INTO icp_profiles
          (name, target_industries, employee_min, employee_max, revenue_min, revenue_max, countries, technologies)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        values
      );
    }

    return res.status(status).json({
      message: 'ICP profile saved. Import a lead file to apply the updated rules.',
      icp: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to save ICP profile' });
  }
});

module.exports = router;

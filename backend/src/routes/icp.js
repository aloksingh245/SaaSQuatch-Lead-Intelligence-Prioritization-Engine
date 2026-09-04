const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { generateLeads } = require('../services/generator');

// GET /api/icp - Get the latest ICP profile
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM icp_profiles ORDER BY created_at DESC LIMIT 1');
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'No ICP profile found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// POST /api/icp - Create or update an ICP profile
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

  if (!name) return res.status(400).json({ error: 'Profile name is required' });

  try {
    const result = await pool.query(
      `INSERT INTO icp_profiles 
        (name, target_industries, employee_min, employee_max, revenue_min, revenue_max, countries, technologies)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        name,
        target_industries || [],
        employee_min || null,
        employee_max || null,
        revenue_min || null,
        revenue_max || null,
        countries || [],
        technologies || []
      ]
    );

    const newIcp = result.rows[0];

    // 🔥 THE MAGIC: Automatically start hunting for leads in the background
    setImmediate(() => {
      generateLeads(newIcp.id).catch(console.error);
    });

    res.status(201).json({
      message: 'ICP Profile saved. The Hunter has been dispatched to find matching leads.',
      icp: newIcp
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save ICP profile' });
  }
});

module.exports = router;

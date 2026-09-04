/**
 * Scoring Engine — src/services/scorer.js
 *
 * PURPOSE: Turn one clean lead + one ICP profile into a 0–100 score
 * with a human-readable explanation per factor.
 *
 * RULES (non-negotiable):
 *  - Pure function. No DB calls. No side effects. No randomness.
 *  - Same input → same output, every single time.
 *  - scoreLead() is the only public API. Everything else is internal.
 *
 * SCORING TABLE (total = 100):
 *  Industry match    25 pts
 *  Employee range    20 pts  (partial credit for near-miss)
 *  Revenue fit       15 pts  (partial credit for near-miss)
 *  Geography         10 pts
 *  Technology match  10 pts
 *  Website validity   5 pts
 *  Email validity     5 pts
 *  Decision maker     5 pts
 *  Growth trigger     5 pts
 *
 * PRIORITY BUCKETS:
 *  HIGH      80–100
 *  MEDIUM    60–79
 *  LOW       40–59
 *  VERY_LOW   0–39
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// FACTOR WEIGHTS — single source of truth
// Change a number here and it changes everywhere automatically.
// ─────────────────────────────────────────────────────────────────────────────

const WEIGHTS = {
  industry:       25,
  employees:      20,
  revenue:        15,
  geography:      10,
  technology:     10,
  website:         5,
  email:           5,
  decision_maker:  5,
  growth_trigger:  5,
};

// Sanity check — weights must sum to 100
const TOTAL_WEIGHT = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
if (TOTAL_WEIGHT !== 100) {
  throw new Error(`[scorer] Weights must sum to 100. Current sum: ${TOTAL_WEIGHT}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTIAL CREDIT BUFFER
//
// When an employee or revenue value misses the ICP range by ≤ this fraction,
// we award half points instead of zero.
//
// Example: ICP max = 500 employees, lead has 600.
//   600 / 500 = 1.20 → 20% over → within 25% buffer → 10/20 pts
//   600 / 500 = 1.20 → 20% over → within 25% buffer → award half
// ─────────────────────────────────────────────────────────────────────────────

const NEAR_MISS_BUFFER = 0.25; // 25% tolerance

// ─────────────────────────────────────────────────────────────────────────────
// INDIVIDUAL SCORING FACTORS
// Each returns: { points: number, reason: string }
// ─────────────────────────────────────────────────────────────────────────────

/**
 * FACTOR 1 — Industry match (25 pts)
 *
 * Full points if lead's industry matches any of the ICP's target industries.
 * Matching is case-insensitive and trims whitespace.
 * Zero if no match or if either side is missing.
 */
function scoreIndustry(lead, icp) {
  const max = WEIGHTS.industry;

  if (!lead.industry) {
    return { points: 0, reason: 'No industry data available' };
  }

  if (!icp.target_industries || icp.target_industries.length === 0) {
    return { points: 0, reason: 'ICP has no target industries defined' };
  }

  const leadIndustry = lead.industry.toLowerCase().trim();
  const match = icp.target_industries.some(
    (t) => t.toLowerCase().trim() === leadIndustry
  );

  if (match) {
    return {
      points: max,
      reason: `"${lead.industry}" matches target industry`,
    };
  }

  return {
    points: 0,
    reason: `"${lead.industry}" is not in target industries (${icp.target_industries.join(', ')})`,
  };
}

/**
 * FACTOR 2 — Employee range (20 pts, with partial credit)
 *
 * Full points:    lead.employees is within [min, max]
 * Half points:    lead.employees misses by ≤ 25% on either side
 * Zero:           missing data OR too far outside range
 */
function scoreEmployees(lead, icp) {
  const max = WEIGHTS.employees;

  if (lead.employees == null) {
    return { points: 0, reason: 'No employee count data available' };
  }

  const { employee_min: min, employee_max: maxRange } = icp;

  // If ICP has no range defined, skip this factor
  if (min == null && maxRange == null) {
    return { points: 0, reason: 'ICP has no employee range defined' };
  }

  const e = lead.employees;

  // Inside range → full points
  const aboveMin = min == null || e >= min;
  const belowMax = maxRange == null || e <= maxRange;
  if (aboveMin && belowMax) {
    return {
      points: max,
      reason: `${e} employees is within target range (${min ?? '?'}–${maxRange ?? '?'})`,
    };
  }

  // Near-miss check: are we within 25% of the boundary?
  const tooLow  = min != null && e < min;
  const tooHigh = maxRange != null && e > maxRange;

  if (tooLow) {
    const ratio = min / e; // e.g. min=50, e=40 → 1.25 → 25% off
    if (ratio - 1 <= NEAR_MISS_BUFFER) {
      return {
        points: Math.round(max / 2),
        reason: `${e} employees is slightly below target minimum (${min}), partial credit`,
      };
    }
    return {
      points: 0,
      reason: `${e} employees is below target minimum of ${min}`,
    };
  }

  if (tooHigh) {
    const ratio = e / maxRange; // e.g. e=600, max=500 → 1.20 → 20% over
    if (ratio - 1 <= NEAR_MISS_BUFFER) {
      return {
        points: Math.round(max / 2),
        reason: `${e} employees slightly exceeds target maximum (${maxRange}), partial credit`,
      };
    }
    return {
      points: 0,
      reason: `${e} employees exceeds target maximum of ${maxRange}`,
    };
  }

  return { points: 0, reason: 'Employee count outside target range' };
}

/**
 * FACTOR 3 — Revenue fit (15 pts, with partial credit)
 *
 * Same logic as employees but for revenue.
 * Revenue is stored as raw USD number (e.g. 5_000_000).
 */
function scoreRevenue(lead, icp) {
  const max = WEIGHTS.revenue;

  if (lead.revenue == null) {
    return { points: 0, reason: 'No revenue data available' };
  }

  const { revenue_min: min, revenue_max: maxRange } = icp;

  if (min == null && maxRange == null) {
    return { points: 0, reason: 'ICP has no revenue range defined' };
  }

  const r = Number(lead.revenue);

  const aboveMin = min == null || r >= Number(min);
  const belowMax = maxRange == null || r <= Number(maxRange);

  if (aboveMin && belowMax) {
    return {
      points: max,
      reason: `Revenue $${fmtMoney(r)} is within target range ($${fmtMoney(min)}–$${fmtMoney(maxRange)})`,
    };
  }

  const tooLow  = min != null && r < Number(min);
  const tooHigh = maxRange != null && r > Number(maxRange);

  if (tooLow) {
    const ratio = Number(min) / r;
    if (ratio - 1 <= NEAR_MISS_BUFFER) {
      return {
        points: Math.round(max / 2),
        reason: `Revenue $${fmtMoney(r)} is slightly below target minimum ($${fmtMoney(min)}), partial credit`,
      };
    }
    return {
      points: 0,
      reason: `Revenue $${fmtMoney(r)} is below target minimum of $${fmtMoney(min)}`,
    };
  }

  if (tooHigh) {
    const ratio = r / Number(maxRange);
    if (ratio - 1 <= NEAR_MISS_BUFFER) {
      return {
        points: Math.round(max / 2),
        reason: `Revenue $${fmtMoney(r)} slightly exceeds target maximum ($${fmtMoney(maxRange)}), partial credit`,
      };
    }
    return {
      points: 0,
      reason: `Revenue $${fmtMoney(r)} exceeds target maximum of $${fmtMoney(maxRange)}`,
    };
  }

  return { points: 0, reason: 'Revenue outside target range' };
}

/**
 * FACTOR 4 — Geography (10 pts)
 *
 * Full points if lead.country matches any country in icp.countries.
 * Case-insensitive match.
 */
function scoreGeography(lead, icp) {
  const max = WEIGHTS.geography;

  if (!lead.country) {
    return { points: 0, reason: 'No country data available' };
  }

  if (!icp.countries || icp.countries.length === 0) {
    return { points: 0, reason: 'ICP has no target countries defined' };
  }

  const leadCountry = lead.country.toLowerCase().trim();
  const match = icp.countries.some((c) => c.toLowerCase().trim() === leadCountry);

  if (match) {
    return {
      points: max,
      reason: `${lead.country} is a target geography`,
    };
  }

  return {
    points: 0,
    reason: `${lead.country} is not in target geographies (${icp.countries.join(', ')})`,
  };
}

/**
 * FACTOR 5 — Technology match (10 pts)
 *
 * Full points if lead has ANY technology that appears in icp.technologies.
 * Case-insensitive. Even one match = full points.
 *
 * WHY all-or-nothing here (not partial)?
 * Because one tech match already signals "they're a buyer of tools like ours."
 * More matches don't make them a better lead — they're already warm.
 */
function scoreTechnology(lead, icp) {
  const max = WEIGHTS.technology;

  if (!lead.technologies || lead.technologies.length === 0) {
    return { points: 0, reason: 'No technology data available' };
  }

  if (!icp.technologies || icp.technologies.length === 0) {
    return { points: 0, reason: 'ICP has no target technologies defined' };
  }

  const icpTechLower = icp.technologies.map((t) => t.toLowerCase().trim());
  const matches = lead.technologies.filter((t) =>
    icpTechLower.includes(t.toLowerCase().trim())
  );

  if (matches.length > 0) {
    return {
      points: max,
      reason: `Uses ${matches.join(', ')} — matching target technology signal`,
    };
  }

  return {
    points: 0,
    reason: `No technology overlap with target stack (${icp.technologies.join(', ')})`,
  };
}

/**
 * FACTOR 6 — Website validity (5 pts)
 *
 * Full points if lead.website is a non-null, non-empty string.
 *
 * WHY? A missing website often means: stale data, defunct company,
 * or a lead that was never properly sourced. Not worth cold-calling.
 */
function scoreWebsite(lead) {
  const max = WEIGHTS.website;

  if (lead.website && lead.website.trim() !== '') {
    return { points: max, reason: `Has valid website (${lead.website})` };
  }

  return { points: 0, reason: 'No website data available' };
}

/**
 * FACTOR 7 — Email validity (5 pts)
 *
 * Full points if lead.email is non-null (normalizer already validated format).
 *
 * WHY? A valid email means you can reach out immediately.
 * Without one, you have to find a contact first — extra friction.
 */
function scoreEmail(lead) {
  const max = WEIGHTS.email;

  if (lead.email && lead.email.trim() !== '') {
    return { points: max, reason: `Has valid business email (${lead.email})` };
  }

  return { points: 0, reason: 'No valid email available' };
}

/**
 * FACTOR 8 — Decision maker (5 pts)
 *
 * Full points if lead.decision_maker is non-null.
 *
 * WHY? Knowing WHO to call is half the battle in outbound sales.
 * A company name without a contact = cold company, not a warm lead.
 */
function scoreDecisionMaker(lead) {
  const max = WEIGHTS.decision_maker;

  if (lead.decision_maker && lead.decision_maker.trim() !== '') {
    return {
      points: max,
      reason: `Decision maker identified: ${lead.decision_maker}`,
    };
  }

  return { points: 0, reason: 'No decision maker identified' };
}

/**
 * FACTOR 9 — Growth / trigger signal (5 pts)
 *
 * Full points if any signal of recent activity exists.
 * Currently detects: linkedin_url presence (proxy for active sourcing)
 * and can be extended with enrichment data later.
 *
 * WHY only 5 pts? Trigger signals are optional enrichment data.
 * Many leads won't have them in a raw CSV. The score is useful without them.
 * When enrichment is added (Chunk 7+), this factor gains more substance.
 */
function scoreGrowthTrigger(lead) {
  const max = WEIGHTS.growth_trigger;

  // Check enriched growth signals (from enrichment_results later)
  if (lead.growth_signals && Array.isArray(lead.growth_signals) && lead.growth_signals.length > 0) {
    return {
      points: max,
      reason: `Growth signal detected: ${lead.growth_signals.join(', ')}`,
    };
  }

  // Fallback: LinkedIn URL is a proxy — sourced leads with LinkedIn profiles
  // are more likely to be actively monitored
  if (lead.linkedin_url) {
    return {
      points: max,
      reason: 'LinkedIn profile available — lead is actively sourced',
    };
  }

  return {
    points: 0,
    reason: 'No growth or trigger signals available',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PRIORITY BUCKET
//
// Converts a 0–100 score into a named bucket.
// The ranges are defined by the spec and must not change without updating tests.
// ─────────────────────────────────────────────────────────────────────────────

function priorityFromScore(score) {
  if (score >= 80) return 'HIGH';
  if (score >= 60) return 'MEDIUM';
  if (score >= 40) return 'LOW';
  return 'VERY_LOW';
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — scoreLead()
//
// Takes:
//   lead — a normalized lead object (from normalizer.normalizeRow())
//   icp  — an ICP profile object (from the icp_profiles DB table)
//
// Returns:
//   {
//     leadId:   string | null,
//     score:    number (0–100),
//     priority: 'HIGH' | 'MEDIUM' | 'LOW' | 'VERY_LOW',
//     reasons:  [{ factor, points, maxPoints, reason }]
//   }
//
// DETERMINISTIC: no randomness, no external calls, no time-based logic.
// ─────────────────────────────────────────────────────────────────────────────

function scoreLead(lead, icp) {
  // Run every factor
  const factors = [
    { factor: 'industry',        max: WEIGHTS.industry,        ...scoreIndustry(lead, icp) },
    { factor: 'employees',       max: WEIGHTS.employees,       ...scoreEmployees(lead, icp) },
    { factor: 'revenue',         max: WEIGHTS.revenue,         ...scoreRevenue(lead, icp) },
    { factor: 'geography',       max: WEIGHTS.geography,       ...scoreGeography(lead, icp) },
    { factor: 'technology',      max: WEIGHTS.technology,      ...scoreTechnology(lead, icp) },
    { factor: 'website',         max: WEIGHTS.website,         ...scoreWebsite(lead) },
    { factor: 'email',           max: WEIGHTS.email,           ...scoreEmail(lead) },
    { factor: 'decision_maker',  max: WEIGHTS.decision_maker,  ...scoreDecisionMaker(lead) },
    { factor: 'growth_trigger',  max: WEIGHTS.growth_trigger,  ...scoreGrowthTrigger(lead) },
  ];

  // Sum all points (cap at 100 to guard against future weight changes)
  const totalScore = Math.min(
    100,
    factors.reduce((sum, f) => sum + f.points, 0)
  );

  const priority = priorityFromScore(totalScore);

  // Build the component_scores map (factor → points) for DB storage
  const componentScores = {};
  for (const f of factors) {
    componentScores[f.factor] = { points: f.points, max: f.max };
  }

  return {
    leadId:          lead.id ?? null,
    score:           totalScore,
    priority,
    componentScores,
    reasons: factors.map((f) => ({
      factor:    f.factor,
      points:    f.points,
      maxPoints: f.max,
      reason:    f.reason,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a raw dollar number for human-readable reasons.
 * 5_000_000 → "5M"   |   100_000 → "100K"   |   500 → "500"
 */
function fmtMoney(n) {
  if (n == null) return '?';
  n = Number(n);
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  scoreLead,
  priorityFromScore,
  WEIGHTS,
  // Exported for unit testing individual factors
  _factors: {
    scoreIndustry,
    scoreEmployees,
    scoreRevenue,
    scoreGeography,
    scoreTechnology,
    scoreWebsite,
    scoreEmail,
    scoreDecisionMaker,
    scoreGrowthTrigger,
  },
};

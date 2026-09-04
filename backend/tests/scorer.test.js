/**
 * tests/scorer.test.js
 *
 * Tests every scoring factor independently, then the full scoreLead() function.
 * Why test factors individually? So when a score is wrong, you know WHICH factor
 * is broken without hunting through the entire engine.
 */

'use strict';

const { scoreLead, priorityFromScore, WEIGHTS, _factors } = require('../src/services/scorer');
const {
  scoreIndustry,
  scoreEmployees,
  scoreRevenue,
  scoreGeography,
  scoreTechnology,
  scoreWebsite,
  scoreEmail,
  scoreDecisionMaker,
  scoreGrowthTrigger,
} = _factors;

// ─── The Demo ICP (same values as seed.js) ───────────────────────────────────

const DEMO_ICP = {
  target_industries: ['SaaS', 'B2B SaaS', 'Software', 'Cloud Software'],
  employee_min: 50,
  employee_max: 500,
  revenue_min: 5_000_000,
  revenue_max: 100_000_000,
  countries: ['United States'],
  technologies: ['CRM', 'Salesforce', 'HubSpot', 'cloud', 'AWS', 'GCP', 'Azure', 'sales tooling'],
};

// ─────────────────────────────────────────────────────────────────────────────
// WEIGHTS
// ─────────────────────────────────────────────────────────────────────────────

describe('WEIGHTS', () => {
  test('sum to exactly 100', () => {
    const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
    expect(total).toBe(100);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Industry
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreIndustry', () => {
  test('exact match → 25', () => {
    const r = scoreIndustry({ industry: 'SaaS' }, DEMO_ICP);
    expect(r.points).toBe(25);
  });
  test('case-insensitive match → 25', () => {
    const r = scoreIndustry({ industry: 'saas' }, DEMO_ICP);
    expect(r.points).toBe(25);
  });
  test('non-matching industry → 0', () => {
    const r = scoreIndustry({ industry: 'Real Estate' }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('missing industry → 0', () => {
    const r = scoreIndustry({ industry: null }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('reason string is non-empty', () => {
    const r = scoreIndustry({ industry: 'SaaS' }, DEMO_ICP);
    expect(r.reason.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Employees — including partial credit
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreEmployees', () => {
  test('inside range → 20', () => {
    const r = scoreEmployees({ employees: 250 }, DEMO_ICP);
    expect(r.points).toBe(20);
  });
  test('at lower boundary → 20', () => {
    const r = scoreEmployees({ employees: 50 }, DEMO_ICP);
    expect(r.points).toBe(20);
  });
  test('at upper boundary → 20', () => {
    const r = scoreEmployees({ employees: 500 }, DEMO_ICP);
    expect(r.points).toBe(20);
  });
  test('slightly above max (≤25% over) → 10 (partial)', () => {
    // 600 / 500 = 1.20 → 20% over → within 25% buffer
    const r = scoreEmployees({ employees: 600 }, DEMO_ICP);
    expect(r.points).toBe(10);
  });
  test('slightly below min (≤25% under) → 10 (partial)', () => {
    // min=50, e=40 → 50/40 = 1.25 → exactly 25% → still qualifies
    const r = scoreEmployees({ employees: 40 }, DEMO_ICP);
    expect(r.points).toBe(10);
  });
  test('far above max → 0', () => {
    const r = scoreEmployees({ employees: 5000 }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('far below min → 0', () => {
    const r = scoreEmployees({ employees: 5 }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('missing data → 0', () => {
    const r = scoreEmployees({ employees: null }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Revenue — including partial credit
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreRevenue', () => {
  test('inside range → 15', () => {
    const r = scoreRevenue({ revenue: 20_000_000 }, DEMO_ICP);
    expect(r.points).toBe(15);
  });
  test('at lower boundary → 15', () => {
    const r = scoreRevenue({ revenue: 5_000_000 }, DEMO_ICP);
    expect(r.points).toBe(15);
  });
  test('at upper boundary → 15', () => {
    const r = scoreRevenue({ revenue: 100_000_000 }, DEMO_ICP);
    expect(r.points).toBe(15);
  });
  test('slightly above max (≤25% over) → 8 (partial, rounded)', () => {
    // $110M / $100M = 1.10 → 10% over → partial
    const r = scoreRevenue({ revenue: 110_000_000 }, DEMO_ICP);
    expect(r.points).toBe(8);
  });
  test('slightly below min (≤25% under) → 8 (partial)', () => {
    // $5M * 0.8 = $4M → 20% under → partial
    const r = scoreRevenue({ revenue: 4_000_000 }, DEMO_ICP);
    expect(r.points).toBe(8);
  });
  test('far above max → 0', () => {
    const r = scoreRevenue({ revenue: 1_000_000_000 }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('missing data → 0', () => {
    const r = scoreRevenue({ revenue: null }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Geography
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreGeography', () => {
  test('target country → 10', () => {
    const r = scoreGeography({ country: 'United States' }, DEMO_ICP);
    expect(r.points).toBe(10);
  });
  test('case-insensitive match → 10', () => {
    const r = scoreGeography({ country: 'united states' }, DEMO_ICP);
    expect(r.points).toBe(10);
  });
  test('non-target country → 0', () => {
    const r = scoreGeography({ country: 'Germany' }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('missing country → 0', () => {
    const r = scoreGeography({ country: null }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Technology
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreTechnology', () => {
  test('one match → 10', () => {
    const r = scoreTechnology({ technologies: ['Salesforce', 'Slack'] }, DEMO_ICP);
    expect(r.points).toBe(10);
  });
  test('case-insensitive match → 10', () => {
    const r = scoreTechnology({ technologies: ['salesforce'] }, DEMO_ICP);
    expect(r.points).toBe(10);
  });
  test('no overlap → 0', () => {
    const r = scoreTechnology({ technologies: ['Jira', 'Confluence'] }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('empty tech list → 0', () => {
    const r = scoreTechnology({ technologies: [] }, DEMO_ICP);
    expect(r.points).toBe(0);
  });
  test('reason lists matched technologies', () => {
    const r = scoreTechnology({ technologies: ['HubSpot'] }, DEMO_ICP);
    expect(r.reason).toContain('HubSpot');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Website, Email, Decision Maker
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreWebsite', () => {
  test('has website → 5', () => {
    expect(scoreWebsite({ website: 'https://acme.com' }).points).toBe(5);
  });
  test('null website → 0', () => {
    expect(scoreWebsite({ website: null }).points).toBe(0);
  });
});

describe('scoreEmail', () => {
  test('has email → 5', () => {
    expect(scoreEmail({ email: 'john@acme.com' }).points).toBe(5);
  });
  test('null email → 0', () => {
    expect(scoreEmail({ email: null }).points).toBe(0);
  });
});

describe('scoreDecisionMaker', () => {
  test('has decision maker → 5', () => {
    expect(scoreDecisionMaker({ decision_maker: 'Jane Smith, VP Sales' }).points).toBe(5);
  });
  test('null decision maker → 0', () => {
    expect(scoreDecisionMaker({ decision_maker: null }).points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Growth Trigger
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreGrowthTrigger', () => {
  test('has growth_signals array → 5', () => {
    const r = scoreGrowthTrigger({ growth_signals: ['Series B funding'] });
    expect(r.points).toBe(5);
  });
  test('has linkedin_url → 5', () => {
    const r = scoreGrowthTrigger({ linkedin_url: 'https://linkedin.com/company/acme' });
    expect(r.points).toBe(5);
  });
  test('no signals, no linkedin → 0', () => {
    const r = scoreGrowthTrigger({ linkedin_url: null });
    expect(r.points).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Priority Buckets
// ─────────────────────────────────────────────────────────────────────────────

describe('priorityFromScore', () => {
  test('100 → HIGH',     () => expect(priorityFromScore(100)).toBe('HIGH'));
  test('80  → HIGH',     () => expect(priorityFromScore(80)).toBe('HIGH'));
  test('79  → MEDIUM',   () => expect(priorityFromScore(79)).toBe('MEDIUM'));
  test('60  → MEDIUM',   () => expect(priorityFromScore(60)).toBe('MEDIUM'));
  test('59  → LOW',      () => expect(priorityFromScore(59)).toBe('LOW'));
  test('40  → LOW',      () => expect(priorityFromScore(40)).toBe('LOW'));
  test('39  → VERY_LOW', () => expect(priorityFromScore(39)).toBe('VERY_LOW'));
  test('0   → VERY_LOW', () => expect(priorityFromScore(0)).toBe('VERY_LOW'));
});

// ─────────────────────────────────────────────────────────────────────────────
// scoreLead() — full integration
// ─────────────────────────────────────────────────────────────────────────────

describe('scoreLead', () => {
  test('perfect lead scores 100 and is HIGH', () => {
    const lead = {
      id: 'test-123',
      industry: 'SaaS',
      employees: 250,
      revenue: 20_000_000,
      country: 'United States',
      technologies: ['Salesforce'],
      website: 'https://acme.com',
      email: 'ceo@acme.com',
      decision_maker: 'Jane Smith',
      linkedin_url: 'https://linkedin.com/company/acme',
    };
    const result = scoreLead(lead, DEMO_ICP);
    expect(result.score).toBe(100);
    expect(result.priority).toBe('HIGH');
    expect(result.leadId).toBe('test-123');
    expect(result.reasons).toHaveLength(9);
  });

  test('completely empty lead scores 0 and is VERY_LOW', () => {
    const lead = {
      industry: null, employees: null, revenue: null,
      country: null, technologies: [], website: null,
      email: null, decision_maker: null, linkedin_url: null,
    };
    const result = scoreLead(lead, DEMO_ICP);
    expect(result.score).toBe(0);
    expect(result.priority).toBe('VERY_LOW');
  });

  test('lead with only industry match scores 25 → VERY_LOW', () => {
    const lead = {
      industry: 'SaaS', employees: null, revenue: null,
      country: null, technologies: [], website: null,
      email: null, decision_maker: null, linkedin_url: null,
    };
    const result = scoreLead(lead, DEMO_ICP);
    expect(result.score).toBe(25);
    expect(result.priority).toBe('VERY_LOW');
  });

  test('result includes componentScores with all 9 factors', () => {
    const lead = { industry: 'SaaS', employees: 250, revenue: 20_000_000,
                   country: 'United States', technologies: ['Salesforce'],
                   website: 'https://acme.com', email: 'a@b.com',
                   decision_maker: 'Alice', linkedin_url: null };
    const result = scoreLead(lead, DEMO_ICP);
    const factorNames = Object.keys(result.componentScores);
    expect(factorNames).toContain('industry');
    expect(factorNames).toContain('employees');
    expect(factorNames).toContain('revenue');
    expect(factorNames).toContain('geography');
    expect(factorNames).toContain('technology');
    expect(factorNames).toContain('website');
    expect(factorNames).toContain('email');
    expect(factorNames).toContain('decision_maker');
    expect(factorNames).toContain('growth_trigger');
  });

  test('score is deterministic — same input twice produces identical output', () => {
    const lead = { industry: 'SaaS', employees: 250, revenue: 20_000_000,
                   country: 'United States', technologies: ['AWS'],
                   website: 'https://x.com', email: 'a@x.com',
                   decision_maker: 'Bob', linkedin_url: null };
    const r1 = scoreLead(lead, DEMO_ICP);
    const r2 = scoreLead(lead, DEMO_ICP);
    expect(r1.score).toBe(r2.score);
    expect(r1.priority).toBe(r2.priority);
    expect(JSON.stringify(r1.reasons)).toBe(JSON.stringify(r2.reasons));
  });
});

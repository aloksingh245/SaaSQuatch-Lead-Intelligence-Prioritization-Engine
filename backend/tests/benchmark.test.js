/**
 * tests/benchmark.test.js
 *
 * Tests the pure benchmark functions — no DB required.
 */

'use strict';

const {
  runBenchmark,
  _internal: { accuracy, precisionAtK, confusion, normalizeLabel },
} = require('../src/services/benchmark');

// ─── Demo ICP (same as seed) ──────────────────────────────────────────────────

const ICP = {
  target_industries: ['SaaS', 'B2B SaaS', 'Software', 'Cloud Software'],
  employee_min:   50,
  employee_max:   500,
  revenue_min:    5_000_000,
  revenue_max:    100_000_000,
  countries:      ['United States'],
  technologies:   ['CRM','Salesforce','HubSpot','cloud','AWS','GCP','Azure','sales tooling'],
};

// ─── Perfect lead (scores 100) ────────────────────────────────────────────────

const PERFECT = {
  company_name:   'Acme SaaS',
  industry:       'SaaS',
  employees:      250,
  revenue:        20_000_000,
  country:        'United States',
  technologies:   ['Salesforce'],
  email:          'ceo@acme.com',
  website:        'https://acme.com',
  decision_maker: 'Jane Smith',
  linkedin_url:   'https://linkedin.com/company/acme',
};

// ─── Terrible lead (scores 0) ─────────────────────────────────────────────────

const TERRIBLE = {
  company_name: 'Bad Corp',
  industry: null, employees: null, revenue: null,
  country: null, technologies: [], email: null,
  website: null, decision_maker: null, linkedin_url: null,
};

// ─────────────────────────────────────────────────────────────────────────────
// normalizeLabel
// ─────────────────────────────────────────────────────────────────────────────

describe('normalizeLabel', () => {
  test('"HIGH" → "HIGH"',       () => expect(normalizeLabel('HIGH')).toBe('HIGH'));
  test('"high" → "HIGH"',       () => expect(normalizeLabel('high')).toBe('HIGH'));
  test('"MEDIUM" → "MEDIUM"',   () => expect(normalizeLabel('MEDIUM')).toBe('MEDIUM'));
  test('"LOW" → "LOW"',         () => expect(normalizeLabel('LOW')).toBe('LOW'));
  test('"VERY_LOW" → "VERY_LOW"',   () => expect(normalizeLabel('VERY_LOW')).toBe('VERY_LOW'));
  test('"very low" → "VERY_LOW"',   () => expect(normalizeLabel('very low')).toBe('VERY_LOW'));
  test('"Very Low" → "VERY_LOW"',   () => expect(normalizeLabel('Very Low')).toBe('VERY_LOW'));
  test('null → null (exclude)',      () => expect(normalizeLabel(null)).toBeNull());
  test('empty string → null',        () => expect(normalizeLabel('')).toBeNull());
  test('blank spaces → null',        () => expect(normalizeLabel('   ')).toBeNull());
  test('unknown value → null',       () => expect(normalizeLabel('GOOD')).toBeNull());
});

// ─────────────────────────────────────────────────────────────────────────────
// accuracy
// ─────────────────────────────────────────────────────────────────────────────

describe('accuracy', () => {
  test('all correct → 1.0', () => {
    const s = [
      { humanLabel: 'HIGH', enginePriority: 'HIGH', match: true },
      { humanLabel: 'LOW',  enginePriority: 'LOW',  match: true },
    ];
    expect(accuracy(s)).toBe(1.0);
  });

  test('none correct → 0', () => {
    const s = [{ humanLabel: 'HIGH', enginePriority: 'LOW', match: false }];
    expect(accuracy(s)).toBe(0);
  });

  test('half correct → 0.5', () => {
    const s = [
      { match: true  },
      { match: false },
    ];
    expect(accuracy(s)).toBe(0.5);
  });

  test('empty array → 0', () => {
    expect(accuracy([])).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// precisionAtK
// ─────────────────────────────────────────────────────────────────────────────

describe('precisionAtK', () => {
  // Build a ranked list of 20 leads: first 8 are HIGH, rest are LOW
  const ranked = [
    ...Array(8).fill({ humanLabel: 'HIGH',   engineScore: 90 }),
    ...Array(12).fill({ humanLabel: 'LOW',    engineScore: 30 }),
  ];

  test('Precision@10 with 8 HIGH in top 10 → 0.8', () => {
    expect(precisionAtK(ranked, 10)).toBe(0.8);
  });

  test('Precision@20 with 8 HIGH in 20 → 0.4', () => {
    expect(precisionAtK(ranked, 20)).toBe(0.4);
  });

  test('K > dataset size → uses full set', () => {
    const small = [
      { humanLabel: 'HIGH' },
      { humanLabel: 'HIGH' },
      { humanLabel: 'LOW'  },
    ];
    // 2/3 HIGH in 3 leads (k=10 capped at 3)
    expect(precisionAtK(small, 10)).toBeCloseTo(0.6667, 3);
  });

  test('zero HIGH leads → 0', () => {
    const noHigh = Array(10).fill({ humanLabel: 'LOW' });
    expect(precisionAtK(noHigh, 10)).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// confusion matrix
// ─────────────────────────────────────────────────────────────────────────────

describe('buildConfusionMatrix', () => {
  test('correct predictions land on the diagonal', () => {
    const s = [
      { humanLabel: 'HIGH',   enginePriority: 'HIGH'   },
      { humanLabel: 'MEDIUM', enginePriority: 'MEDIUM' },
      { humanLabel: 'LOW',    enginePriority: 'LOW'    },
    ];
    const m = confusion(s);
    expect(m.HIGH.HIGH).toBe(1);
    expect(m.MEDIUM.MEDIUM).toBe(1);
    expect(m.LOW.LOW).toBe(1);
    // Off-diagonal should be zero
    expect(m.HIGH.LOW).toBe(0);
  });

  test('mis-predictions are off-diagonal', () => {
    const s = [{ humanLabel: 'HIGH', enginePriority: 'LOW' }];
    const m = confusion(s);
    expect(m.HIGH.LOW).toBe(1);
    expect(m.HIGH.HIGH).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runBenchmark — integration
// ─────────────────────────────────────────────────────────────────────────────

describe('runBenchmark', () => {
  test('throws when rows array is empty', () => {
    expect(() => runBenchmark([], ICP)).toThrow();
  });

  test('throws when zero rows have a label', () => {
    const rows = [
      { lead: PERFECT,  humanLabel: null },
      { lead: TERRIBLE, humanLabel: ''   },
    ];
    expect(() => runBenchmark(rows, ICP)).toThrow(/Zero labeled rows/);
  });

  test('skips unlabeled rows and warns (no throw)', () => {
    const rows = [
      { lead: PERFECT,  humanLabel: 'HIGH' },
      { lead: TERRIBLE, humanLabel: null   }, // unlabeled — skipped
    ];
    const result = runBenchmark(rows, ICP);
    expect(result.totalInputRows).toBe(2);
    expect(result.labeledRows).toBe(1);
    expect(result.skippedRows).toBe(1);
  });

  test('perfect lead labeled HIGH → accuracy 1.0', () => {
    const rows = [{ lead: PERFECT, humanLabel: 'HIGH' }];
    const result = runBenchmark(rows, ICP);
    expect(result.metrics.accuracy).toBe(1.0);
    expect(result.breakdown[0].match).toBe(true);
  });

  test('terrible lead labeled HIGH → accuracy 0 (engine says VERY_LOW)', () => {
    const rows = [{ lead: TERRIBLE, humanLabel: 'HIGH' }];
    const result = runBenchmark(rows, ICP);
    expect(result.metrics.accuracy).toBe(0);
    expect(result.breakdown[0].enginePriority).toBe('VERY_LOW');
  });

  test('result has all required keys', () => {
    const rows = [{ lead: PERFECT, humanLabel: 'HIGH' }];
    const result = runBenchmark(rows, ICP);
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('metrics.accuracy');
    expect(result).toHaveProperty('metrics.precisionAt10');
    expect(result).toHaveProperty('metrics.precisionAt20');
    expect(result).toHaveProperty('latency.perLeadMs');
    expect(result).toHaveProperty('confusionMatrix');
    expect(result).toHaveProperty('breakdown');
  });

  test('latency.perLeadMs is a positive number', () => {
    const rows = [{ lead: PERFECT, humanLabel: 'HIGH' }];
    const result = runBenchmark(rows, ICP);
    expect(result.latency.perLeadMs).toBeGreaterThanOrEqual(0);
  });

  test('benchmark is deterministic — same result on two runs', () => {
    const rows = [
      { lead: PERFECT,  humanLabel: 'HIGH'     },
      { lead: TERRIBLE, humanLabel: 'VERY_LOW' },
    ];
    const r1 = runBenchmark(rows, ICP);
    const r2 = runBenchmark(rows, ICP);
    expect(r1.metrics.accuracy).toBe(r2.metrics.accuracy);
    expect(r1.metrics.precisionAt10).toBe(r2.metrics.precisionAt10);
    expect(r1.breakdown[0].engineScore).toBe(r2.breakdown[0].engineScore);
  });

  test('Precision@10 with 5 HIGH leads in top 10', () => {
    // 5 perfect (HIGH) + 5 terrible (VERY_LOW)
    const rows = [
      ...Array(5).fill({ lead: PERFECT,  humanLabel: 'HIGH'     }),
      ...Array(5).fill({ lead: TERRIBLE, humanLabel: 'VERY_LOW' }),
    ];
    const result = runBenchmark(rows, ICP);
    expect(result.metrics.precisionAt10).toBe(0.5);
  });
});

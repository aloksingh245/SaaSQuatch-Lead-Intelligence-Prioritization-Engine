/**
 * tests/normalizer.test.js
 *
 * WHY test normalizers specifically?
 * Because messy input is unpredictable. These tests pin down exactly what
 * "cleaned" means, so future changes can't silently break the rules.
 *
 * Run with: npm test
 */

'use strict';

const {
  normalizeDomain,
  normalizeCountry,
  normalizeIndustry,
  normalizeEmployees,
  normalizeRevenue,
  normalizeTechnologies,
  normalizeEmail,
  normalizeWebsite,
  normalizeCompanyName,
  normalizeRow,
} = require('../src/services/normalizer');

// ─── Domain ──────────────────────────────────────────────────────────────────

describe('normalizeDomain', () => {
  test('strips https:// and www.', () => {
    expect(normalizeDomain('https://www.acme.com')).toBe('acme.com');
  });
  test('handles bare domain', () => {
    expect(normalizeDomain('acme.com')).toBe('acme.com');
  });
  test('extracts domain from email', () => {
    expect(normalizeDomain('john@acme.com')).toBe('acme.com');
  });
  test('extracts domain from mailto:', () => {
    expect(normalizeDomain('mailto:john@acme.com')).toBe('acme.com');
  });
  test('returns null for empty string', () => {
    expect(normalizeDomain('')).toBeNull();
  });
  test('returns null for null', () => {
    expect(normalizeDomain(null)).toBeNull();
  });
  test('returns null for plain word with no dot', () => {
    expect(normalizeDomain('notadomain')).toBeNull();
  });
});

// ─── Country ─────────────────────────────────────────────────────────────────

describe('normalizeCountry', () => {
  test('"US" → "United States"', () => {
    expect(normalizeCountry('US')).toBe('United States');
  });
  test('"usa" → "United States"', () => {
    expect(normalizeCountry('usa')).toBe('United States');
  });
  test('"U.S.A." → "United States"', () => {
    expect(normalizeCountry('U.S.A.')).toBe('United States');
  });
  test('"uk" → "United Kingdom"', () => {
    expect(normalizeCountry('uk')).toBe('United Kingdom');
  });
  test('unknown value title-cased', () => {
    expect(normalizeCountry('germany')).toBe('Germany');
  });
  test('null → null', () => {
    expect(normalizeCountry(null)).toBeNull();
  });
});

// ─── Industry ────────────────────────────────────────────────────────────────

describe('normalizeIndustry', () => {
  test('"saas" → "SaaS"', () => {
    expect(normalizeIndustry('saas')).toBe('SaaS');
  });
  test('"software as a service" → "SaaS"', () => {
    expect(normalizeIndustry('software as a service')).toBe('SaaS');
  });
  test('"b2b saas" → "B2B SaaS"', () => {
    expect(normalizeIndustry('b2b saas')).toBe('B2B SaaS');
  });
  test('unknown → title-cased', () => {
    expect(normalizeIndustry('real estate')).toBe('Real Estate');
  });
  test('null → null', () => {
    expect(normalizeIndustry(null)).toBeNull();
  });
});

// ─── Employees ───────────────────────────────────────────────────────────────

describe('normalizeEmployees', () => {
  test('plain number', () => {
    expect(normalizeEmployees('250')).toBe(250);
  });
  test('range → midpoint', () => {
    expect(normalizeEmployees('50-200')).toBe(125);
  });
  test('range with "to"', () => {
    expect(normalizeEmployees('100 to 500')).toBe(300);
  });
  test('tilde approximation', () => {
    expect(normalizeEmployees('~500')).toBe(500);
  });
  test('1.5k → 1500', () => {
    expect(normalizeEmployees('1.5k')).toBe(1500);
  });
  test('comma-separated number', () => {
    expect(normalizeEmployees('1,500')).toBe(1500);
  });
  test('null → null', () => {
    expect(normalizeEmployees(null)).toBeNull();
  });
  test('empty string → null', () => {
    expect(normalizeEmployees('')).toBeNull();
  });
});

// ─── Revenue ─────────────────────────────────────────────────────────────────

describe('normalizeRevenue', () => {
  test('"$5M" → 5000000', () => {
    expect(normalizeRevenue('$5M')).toBe(5_000_000);
  });
  test('"5m" → 5000000', () => {
    expect(normalizeRevenue('5m')).toBe(5_000_000);
  });
  test('"1.2B" → 1200000000', () => {
    expect(normalizeRevenue('1.2B')).toBe(1_200_000_000);
  });
  test('range midpoint: "$5M-$10M" → 7500000', () => {
    expect(normalizeRevenue('$5M-$10M')).toBe(7_500_000);
  });
  test('plain number passthrough', () => {
    expect(normalizeRevenue('5000000')).toBe(5_000_000);
  });
  test('null → null', () => {
    expect(normalizeRevenue(null)).toBeNull();
  });
});

// ─── Technologies ────────────────────────────────────────────────────────────

describe('normalizeTechnologies', () => {
  test('comma-separated string', () => {
    expect(normalizeTechnologies('Salesforce, HubSpot')).toEqual(['Salesforce', 'HubSpot']);
  });
  test('semicolon-separated', () => {
    expect(normalizeTechnologies('AWS; GCP')).toEqual(['AWS', 'GCP']);
  });
  test('array passthrough', () => {
    expect(normalizeTechnologies(['CRM', 'cloud'])).toEqual(['CRM', 'cloud']);
  });
  test('deduplicates', () => {
    expect(normalizeTechnologies('AWS, AWS')).toEqual(['AWS']);
  });
  test('null → []', () => {
    expect(normalizeTechnologies(null)).toEqual([]);
  });
});

// ─── Email ───────────────────────────────────────────────────────────────────

describe('normalizeEmail', () => {
  test('valid email → lowercased', () => {
    expect(normalizeEmail('John@Acme.COM')).toBe('john@acme.com');
  });
  test('invalid → null', () => {
    expect(normalizeEmail('contact@')).toBeNull();
  });
  test('"n/a" → null', () => {
    expect(normalizeEmail('n/a')).toBeNull();
  });
  test('null → null', () => {
    expect(normalizeEmail(null)).toBeNull();
  });
});

// ─── Website ─────────────────────────────────────────────────────────────────

describe('normalizeWebsite', () => {
  test('adds https:// if missing', () => {
    expect(normalizeWebsite('acme.com')).toBe('https://acme.com/');
  });
  test('preserves existing protocol', () => {
    expect(normalizeWebsite('http://acme.com')).toBe('http://acme.com/');
  });
  test('null → null', () => {
    expect(normalizeWebsite(null)).toBeNull();
  });
});

// ─── Company Name ─────────────────────────────────────────────────────────────

describe('normalizeCompanyName', () => {
  test('returns display and normalized forms', () => {
    const result = normalizeCompanyName('Acme Inc.');
    expect(result.display).toBe('Acme Inc.');
    // "inc" stripped, lowercased → "acme"
    expect(result.normalized).toBe('acme');
  });
  test('collapses whitespace', () => {
    const result = normalizeCompanyName('Acme   Corp');
    expect(result.display).toBe('Acme Corp');
  });
  test('null → { display: null, normalized: null }', () => {
    const result = normalizeCompanyName(null);
    expect(result.display).toBeNull();
    expect(result.normalized).toBeNull();
  });
});

// ─── normalizeRow (integration) ──────────────────────────────────────────────

describe('normalizeRow', () => {
  test('handles a realistic CSV row with varied column names', () => {
    const row = {
      'Company Name': 'Acme Inc.',
      'Industry':     'saas',
      'Employees':    '50-200',
      'Revenue':      '$5M',
      'Country':      'US',
      'Technologies': 'Salesforce, HubSpot',
      'Email':        'john@acme.com',
      'Website':      'www.acme.com',
    };
    const result = normalizeRow(row);
    expect(result.company_name).toBe('Acme Inc.');
    expect(result.industry).toBe('SaaS');
    expect(result.employees).toBe(125);
    expect(result.revenue).toBe(5_000_000);
    expect(result.country).toBe('United States');
    expect(result.technologies).toEqual(['Salesforce', 'HubSpot']);
    expect(result.email).toBe('john@acme.com');
    expect(result.domain).toBe('acme.com');
  });

  test('returns nulls gracefully for empty row', () => {
    const result = normalizeRow({});
    expect(result.company_name).toBeNull();
    expect(result.industry).toBeNull();
    expect(result.employees).toBeNull();
    expect(result.technologies).toEqual([]);
  });
});

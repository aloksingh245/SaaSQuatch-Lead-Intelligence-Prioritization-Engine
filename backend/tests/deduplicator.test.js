/**
 * tests/deduplicator.test.js
 *
 * Tests the pure buildFieldDiff() function — no DB needed.
 * findDuplicate() and logDuplicate() need a real DB so we test
 * those in integration tests later (after db:migrate runs).
 */

'use strict';

const { buildFieldDiff } = require('../src/services/deduplicator');

// Base "existing" lead as it would come from the DB
const BASE_EXISTING = {
  company_name:  'Acme Inc.',
  industry:      'SaaS',
  employees:     250,
  revenue:       20_000_000,
  country:       'United States',
  email:         'john@acme.com',
  website:       'https://acme.com/',
  decision_maker: 'Jane Smith',
};

describe('buildFieldDiff', () => {

  test('identical lead → empty diff (no false positives)', () => {
    const incoming = {
      company_name:  'Acme Inc.',
      industry:      'SaaS',
      employees:     250,
      revenue:       20_000_000,
      country:       'United States',
      email:         'john@acme.com',
      website:       'https://acme.com/',
      decision_maker: 'Jane Smith',
    };
    expect(buildFieldDiff(incoming, BASE_EXISTING)).toEqual({});
  });

  test('different employee count → diff shows both values', () => {
    const incoming = { ...BASE_EXISTING, employees: 300 };
    const diff = buildFieldDiff(incoming, BASE_EXISTING);
    expect(diff.employees).toEqual({ existing: 250, incoming: 300 });
  });

  test('different revenue → captured in diff', () => {
    const incoming = { ...BASE_EXISTING, revenue: 8_000_000 };
    const diff = buildFieldDiff(incoming, BASE_EXISTING);
    expect(diff.revenue).toEqual({ existing: 20_000_000, incoming: 8_000_000 });
  });

  test('case difference in industry → NOT a diff (case-insensitive)', () => {
    // "SaaS" vs "saas" should not count as a difference
    const incoming = { ...BASE_EXISTING, industry: 'saas' };
    const diff = buildFieldDiff(incoming, BASE_EXISTING);
    expect(diff.industry).toBeUndefined();
  });

  test('different email → captured in diff', () => {
    const incoming = { ...BASE_EXISTING, email: 'new@acme.com' };
    const diff = buildFieldDiff(incoming, BASE_EXISTING);
    expect(diff.email).toEqual({ existing: 'john@acme.com', incoming: 'new@acme.com' });
  });

  test('incoming has null where existing has value → captured', () => {
    const incoming = { ...BASE_EXISTING, decision_maker: null };
    const diff = buildFieldDiff(incoming, BASE_EXISTING);
    expect(diff.decision_maker).toEqual({ existing: 'Jane Smith', incoming: null });
  });

  test('multiple fields differ → all captured', () => {
    const incoming = { ...BASE_EXISTING, employees: 400, revenue: 50_000_000 };
    const diff = buildFieldDiff(incoming, BASE_EXISTING);
    expect(Object.keys(diff)).toContain('employees');
    expect(Object.keys(diff)).toContain('revenue');
    expect(Object.keys(diff)).not.toContain('industry');
  });

  test('string number vs real number → no false positive', () => {
    // DB might return revenue as a string (pg NUMERIC → string), incoming is number
    const incoming = { ...BASE_EXISTING, revenue: 20_000_000 };
    const existing = { ...BASE_EXISTING, revenue: '20000000' };  // string from DB
    const diff = buildFieldDiff(incoming, existing);
    expect(diff.revenue).toBeUndefined();
  });

  test('both null → no diff', () => {
    const incoming = { ...BASE_EXISTING, email: null };
    const existing = { ...BASE_EXISTING, email: null };
    expect(buildFieldDiff(incoming, existing)).toEqual({});
  });
});

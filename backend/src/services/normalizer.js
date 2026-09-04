/**
 * Field normalizer — src/services/normalizer.js
 *
 * PURPOSE: Take raw, messy CSV strings and return clean, typed values.
 *
 * RULES:
 *  - Pure functions only. No database calls. No side effects.
 *  - Invalid/missing input always returns null (never throws).
 *  - Same input ALWAYS produces same output (deterministic).
 *
 * WHY PURE?
 *  Because you can test every function below by just calling it with
 *  a string and checking the result. No server, no DB, no setup needed.
 */

'use strict';

const validator = require('validator');

// ─────────────────────────────────────────────────────────────────────────────
// DOMAIN
// "https://www.acme.com" → "acme.com"
// "john@acme.com"        → "acme.com"
// "acme.com"             → "acme.com"
// ─────────────────────────────────────────────────────────────────────────────

function normalizeDomain(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let s = raw.trim().toLowerCase();
  if (!s) return null;

  // Strip mailto: prefix (seen in some exports)
  if (s.startsWith('mailto:')) s = s.slice(7);

  // If it looks like an email, extract just the domain part
  if (s.includes('@')) s = s.split('@')[1];

  // Add a protocol so the URL parser can work with it
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;

  try {
    // URL() is built into Node — no library needed
    const hostname = new URL(s).hostname.replace(/^www\./, '');
    // A real domain must have at least one dot (e.g., "acme.com")
    if (!hostname || !hostname.includes('.')) return null;
    return hostname;
  } catch {
    return null; // unparseable → treat as missing
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COUNTRY
// "US" / "usa" / "U.S.A." → "United States"
// Unknown codes → title-cased as-is ("Germany" → "Germany")
// ─────────────────────────────────────────────────────────────────────────────

// WHY a lookup table? Because "US", "USA", "u.s.", "United States of America"
// all mean the same thing. A database query will never match them if they stay
// inconsistent. One canonical form = one row when filtering by country.
const COUNTRY_ALIASES = {
  us: 'United States',
  usa: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states of america': 'United States',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  gb: 'United Kingdom',
  'great britain': 'United Kingdom',
  ca: 'Canada',
  au: 'Australia',
  de: 'Germany',
  fr: 'France',
  in: 'India',
  sg: 'Singapore',
  ae: 'United Arab Emirates',
  uae: 'United Arab Emirates',
};

function normalizeCountry(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  // Strip ALL dots for lookup (handles "U.S.A." → "usa")
  const key = s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
  return COUNTRY_ALIASES[key] || toTitleCase(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// INDUSTRY
// "saas" / "software as a service" → "SaaS"
// Unknown values → title-cased as-is
// ─────────────────────────────────────────────────────────────────────────────

const INDUSTRY_ALIASES = {
  saas: 'SaaS',
  'b2b saas': 'B2B SaaS',
  'software as a service': 'SaaS',
  software: 'Software',
  'cloud software': 'Cloud Software',
  fintech: 'Fintech',
  'financial technology': 'Fintech',
  edtech: 'EdTech',
  'education technology': 'EdTech',
  healthtech: 'HealthTech',
  'health technology': 'HealthTech',
  ecommerce: 'E-commerce',
  'e-commerce': 'E-commerce',
  'e commerce': 'E-commerce',
  marketplace: 'Marketplace',
  'information technology': 'IT',
  it: 'IT',
  'hr tech': 'HR Tech',
  hrtech: 'HR Tech',
  'marketing technology': 'MarTech',
  martech: 'MarTech',
};

function normalizeIndustry(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;
  return INDUSTRY_ALIASES[s.toLowerCase()] || toTitleCase(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEES
// "50-200"  → 125   (midpoint of range)
// "~500"    → 500
// "1.5k"    → 1500
// "250"     → 250
// ─────────────────────────────────────────────────────────────────────────────

// WHY midpoint for ranges? Because we need ONE number to compare against
// the ICP's employee_min and employee_max. The midpoint is the least-wrong
// single representation of a range.

function normalizeEmployees(raw) {
  if (raw == null) return null;

  // Remove commas ("1,500" → "1500") and approximation symbols ("~250" → "250")
  const s = String(raw).replace(/,/g, '').replace(/~/g, '').trim();
  if (!s) return null;

  // Range: "50-200" or "50 to 200"
  const rangeMatch = s.match(/^(\d+)\s*[-–to]+\s*(\d+)$/i);
  if (rangeMatch) {
    const lo = parseInt(rangeMatch[1], 10);
    const hi = parseInt(rangeMatch[2], 10);
    return Math.round((lo + hi) / 2);
  }

  // Suffix: "1.5k", "2M"
  const suffixMatch = s.match(/^([\d.]+)\s*([km])$/i);
  if (suffixMatch) {
    const n = parseFloat(suffixMatch[1]);
    const suffix = suffixMatch[2].toLowerCase();
    return Math.round(suffix === 'k' ? n * 1_000 : n * 1_000_000);
  }

  // Plain number
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

// ─────────────────────────────────────────────────────────────────────────────
// REVENUE
// "$5M"        → 5_000_000
// "$1.2B"      → 1_200_000_000
// "$5M-$10M"   → 7_500_000  (midpoint)
// "5000000"    → 5_000_000
// ─────────────────────────────────────────────────────────────────────────────

function normalizeRevenue(raw) {
  if (raw == null) return null;
  // Remove commas and leading $
  const s = String(raw).replace(/,/g, '').trim().replace(/^\$/, '');
  if (!s) return null;

  // Range: "5M-10M" or "$5M-$10M" → midpoint
  // Strip $ from both halves before matching
  const stripped = s.replace(/\$/g, '');
  const rangeMatch = stripped.match(/^([\d.]+\s*[bmk]?)\s*[-–to]+\s*([\d.]+\s*[bmk]?)$/i);
  if (rangeMatch) {
    const lo = parseSingleRevenue(rangeMatch[1]);
    const hi = parseSingleRevenue(rangeMatch[2]);
    if (lo !== null && hi !== null) return (lo + hi) / 2;
  }

  return parseSingleRevenue(s);
}

// Helper: parses "5M", "1.2B", "500k", "5000000" → number
function parseSingleRevenue(s) {
  s = String(s).trim().replace(/^\$/, '');
  const match = s.match(/^([\d.]+)\s*([bmk]?)$/i);
  if (!match) return null;
  const n = parseFloat(match[1]);
  if (isNaN(n)) return null;
  const suffix = match[2].toLowerCase();
  if (suffix === 'b') return n * 1_000_000_000;
  if (suffix === 'm') return n * 1_000_000;
  if (suffix === 'k') return n * 1_000;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// TECHNOLOGIES
// "Salesforce, HubSpot; AWS" → ["Salesforce", "HubSpot", "AWS"]
// Also handles arrays (from enrichment later)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeTechnologies(raw) {
  if (!raw) return [];
  // Already an array (e.g., from enrichment)
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((t) => String(t).trim()).filter(Boolean))];
  }
  // String: split on comma, semicolon, or pipe
  return [
    ...new Set(
      String(raw)
        .split(/[,;|]/)
        .map((t) => t.trim())
        .filter(Boolean)
    ),
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL
// Returns the email lowercased if syntactically valid, else null.
// WHY validate? Because "contact@" and "n/a" show up in real CSV exports.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeEmail(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  return validator.isEmail(s) ? s : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBSITE
// Ensures a protocol prefix exists so the URL is reachable.
// "acme.com" → "https://acme.com"
// ─────────────────────────────────────────────────────────────────────────────

function normalizeWebsite(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return null;
    return u.href;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPANY NAME
// Returns TWO forms:
//   display    → "Acme Inc."   (shown in UI, stored in DB)
//   normalized → "acme"        (used ONLY for deduplication matching)
//
// WHY two forms? The UI should show "Acme Inc." not "acme".
// But deduplication needs to match "Acme Inc.", "ACME, Inc", "Acme"
// as the same company. Stripping legal suffixes + lowercasing achieves that.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCompanyName(raw) {
  if (!raw || typeof raw !== 'string') return { display: null, normalized: null };
  const display = raw.trim().replace(/\s+/g, ' ');
  const normalized = display
    .toLowerCase()
    .replace(/[,.\-]/g, ' ')
    // Strip common legal suffixes that don't help identify the company
    .replace(/\b(inc|llc|ltd|limited|corp|corporation|plc|gmbh|sas|bv|ag)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { display: display || null, normalized: normalized || null };
}

// ─────────────────────────────────────────────────────────────────────────────
// LINKEDIN URL
// Must contain "linkedin.com" to be valid.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeLinkedIn(raw) {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.includes('linkedin.com') ? s : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// normalizeRow — the main entry point
//
// Takes one raw CSV row (key→value object from the CSV parser)
// and runs ALL normalizers above on it.
//
// WHY does it try multiple column name variants?
// Because CSV column headers are inconsistent in the wild:
//   "Company Name", "company_name", "company", "Company" — all mean the same thing.
// We handle them all here so the rest of the system never has to think about it.
// ─────────────────────────────────────────────────────────────────────────────

function normalizeRow(row) {
  // Helper: try multiple possible column names, return first non-empty one
  const get = (...keys) => {
    for (const k of keys) {
      const v = row[k];
      if (v != null && String(v).trim() !== '') return String(v).trim();
    }
    return null;
  };

  const company = normalizeCompanyName(
    get('company_name', 'Company Name', 'company', 'Company', 'COMPANY')
  );

  const rawWebsite = get('website', 'Website', 'url', 'URL', 'Web');
  const rawEmail   = get('email', 'Email', 'Contact Email', 'EMAIL');
  const rawDomain  = get('domain', 'Domain') ||
                     normalizeDomain(rawWebsite) ||
                     normalizeDomain(rawEmail);

  return {
    company_name:         company.display,
    _company_normalized:  company.normalized,   // internal — used by deduplicator
    domain:               normalizeDomain(rawDomain),
    industry:             normalizeIndustry(get('industry', 'Industry', 'Sector', 'INDUSTRY')),
    employees:            normalizeEmployees(get('employees', 'Employees', 'Employee Count', 'Headcount', 'Team Size')),
    revenue:              normalizeRevenue(get('revenue', 'Revenue', 'Annual Revenue', 'ARR')),
    country:              normalizeCountry(get('country', 'Country', 'Location', 'Region', 'Geography')),
    technologies:         normalizeTechnologies(get('technologies', 'Technologies', 'Tech Stack', 'technology', 'Tools')),
    email:                normalizeEmail(rawEmail),
    linkedin_url:         normalizeLinkedIn(get('linkedin_url', 'LinkedIn', 'LinkedIn URL', 'linkedin')),
    decision_maker:       get('decision_maker', 'Decision Maker', 'Contact', 'Contact Name', 'Key Contact'),
    website:              normalizeWebsite(rawWebsite),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) =>
    txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

module.exports = {
  normalizeDomain,
  normalizeCountry,
  normalizeIndustry,
  normalizeEmployees,
  normalizeRevenue,
  normalizeTechnologies,
  normalizeEmail,
  normalizeWebsite,
  normalizeCompanyName,
  normalizeLinkedIn,
  normalizeRow,
};

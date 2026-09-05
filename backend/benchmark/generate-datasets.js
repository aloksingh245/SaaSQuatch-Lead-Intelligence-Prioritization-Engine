/**
 * Generate deterministic demo datasets for the lead-intelligence workflow.
 *
 * These are fixtures, not production leads. Each scenario is intentionally
 * shaped to exercise a scoring factor or an import/data-quality edge case.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { stringify } = require('csv-stringify/sync');

const datasetDir = path.join(__dirname, 'datasets');
const scenarioPlan = [
  ['exact_fit', 'HIGH'],
  ['near_range', 'HIGH'],
  ['partial_stack', 'MEDIUM'],
  ['adjacent_industry', 'LOW'],
  ['wrong_geography', 'MEDIUM'],
  ['missing_firmographics', 'MEDIUM'],
  ['wrong_industry', 'LOW'],
  ['far_size', 'MEDIUM'],
  ['sparse', 'VERY_LOW'],
  ['near_lower_range', 'LOW'],
];

function slug(value) {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function makeLead(index, scenario, label = null) {
  const number = String(index + 1).padStart(3, '0');
  const name = `${scenario.replaceAll('_', ' ')} account ${number}`;
  const domain = `${slug(scenario)}-${number}.io`;
  const fullContact = {
    email: `contact${number}@${domain}`,
    website: `https://${domain}`,
    decision_maker: ['Maya Patel', 'Jon Bell', 'Ari Gomez', 'Leah Chen'][index % 4],
    linkedin_url: `https://linkedin.com/company/${slug(scenario)}-${number}`,
  };

  let lead = {
    company_name: name,
    domain,
    industry: 'SaaS',
    employees: 180 + (index % 7) * 25,
    revenue: 8_000_000 + (index % 8) * 4_000_000,
    country: 'United States',
    technologies: ['Salesforce', 'AWS'],
    ...fullContact,
    scenario,
  };

  if (scenario === 'near_range') {
    lead.employees = index % 2 === 0 ? 550 : 600;
    lead.revenue = index % 2 === 0 ? 110_000_000 : 120_000_000;
  }
  if (scenario === 'partial_stack') {
    lead.technologies = ['Salesforce'];
    lead.email = null;
    lead.website = null;
    lead.decision_maker = null;
    lead.linkedin_url = null;
  }
  if (scenario === 'adjacent_industry') lead.industry = 'Cloud Infrastructure';
  if (scenario === 'wrong_geography') lead.country = index % 2 === 0 ? 'Germany' : 'United Kingdom';
  if (scenario === 'missing_firmographics') {
    lead.employees = null;
    lead.revenue = null;
    lead.technologies = ['HubSpot'];
  }
  if (scenario === 'wrong_industry') lead.industry = index % 2 === 0 ? 'E-commerce' : 'Real Estate';
  if (scenario === 'far_size') {
    lead.employees = 10 + (index % 3) * 5;
    lead.revenue = 500_000 + (index % 3) * 250_000;
    lead.technologies = ['Salesforce'];
  }
  if (scenario === 'sparse') {
    lead.industry = null;
    lead.employees = null;
    lead.revenue = null;
    lead.country = null;
    lead.technologies = [];
    lead.email = null;
    lead.website = null;
    lead.decision_maker = null;
    lead.linkedin_url = null;
  }
  if (scenario === 'near_lower_range') {
    lead.employees = 45;
    lead.revenue = 4_000_000;
    lead.technologies = ['HubSpot'];
    lead.email = null;
    lead.website = null;
    lead.decision_maker = null;
    lead.linkedin_url = null;
  }

  if (label) lead.human_label = label;
  return lead;
}

function serialize(lead) {
  return {
    ...lead,
    technologies: Array.isArray(lead.technologies) ? lead.technologies.join(', ') : lead.technologies,
  };
}

function writeCsv(fileName, rows, directory = datasetDir) {
  fs.writeFileSync(path.join(directory, fileName), stringify(rows.map(serialize), { header: true, columns: Object.keys(rows[0]) }));
}

function buildRichLabeled() {
  const rows = [];
  for (const [scenario, label] of scenarioPlan) {
    for (let i = 0; i < 24; i += 1) rows.push(makeLead(rows.length, scenario, label));
  }
  return rows;
}

function buildPartialDataset() {
  const scenarios = ['near_range', 'partial_stack', 'adjacent_industry', 'missing_firmographics', 'wrong_geography', 'near_lower_range'];
  return Array.from({ length: 120 }, (_, index) => makeLead(index + 500, scenarios[index % scenarios.length]));
}

function buildMessyCrmExport() {
  const rows = [];
  const scenarios = ['exact_fit', 'near_range', 'partial_stack', 'missing_firmographics', 'wrong_geography'];
  for (let index = 0; index < 180; index += 1) {
    const lead = makeLead(index + 800, scenarios[index % scenarios.length]);
    const employeeValues = [`${lead.employees - 40}-${lead.employees + 40}`, `~${lead.employees}`, `${(lead.employees / 1000).toFixed(1)}k`];
    const revenueValues = [`$${(lead.revenue / 1_000_000).toFixed(1)}M`, `${Math.round(lead.revenue / 1_000_000)}M-${Math.round(lead.revenue / 1_000_000 + 2)}M`, String(lead.revenue)];
    const countries = ['US', 'U.S.A.', 'United States of America', 'Canada'];
    const industries = ['saas', 'software as a service', 'cloud software', 'b2b saas', 'financial technology'];
    rows.push({
      Company: lead.company_name,
      Website: index % 9 === 0 ? lead.domain : lead.website,
      Sector: industries[index % industries.length],
      'Employee Count': employeeValues[index % employeeValues.length],
      'Annual Revenue': revenueValues[index % revenueValues.length],
      Location: countries[index % countries.length],
      'Tech Stack': `${lead.technologies || 'Salesforce'}; Slack | Notion`,
      'Contact Email': index % 11 === 0 ? 'not-an-email' : lead.email,
      Contact: index % 8 === 0 ? '' : lead.decision_maker,
      'LinkedIn URL': index % 13 === 0 ? '' : lead.linkedin_url,
      'Source Tag': `crm-export-${(index % 4) + 1}`,
    });
  }
  return rows;
}

function buildDuplicateDataset() {
  const rows = [];
  const bases = Array.from({ length: 30 }, (_, index) => makeLead(index + 1_200, 'exact_fit'));
  rows.push(...bases.map((lead) => ({ ...lead, scenario: 'original' })));

  for (let index = 0; index < 20; index += 1) {
    const base = bases[index % bases.length];
    rows.push({ ...base, company_name: `${base.company_name} — refreshed`, email: `new-contact-${index}@${base.domain}`, scenario: 'duplicate_domain_conflict' });
  }
  for (let index = 0; index < 10; index += 1) {
    const base = bases[index];
    rows.push({ ...base, domain: `alternate-${index + 1}.example.com`, revenue: Number(base.revenue) + 1_000_000, scenario: 'duplicate_company_conflict' });
  }
  for (let index = 0; index < 10; index += 1) {
    rows.push({ company_name: '', domain: '', industry: 'SaaS', employees: '', revenue: '', country: '', technologies: '', email: 'n/a', website: '', decision_maker: '', linkedin_url: '', scenario: 'invalid_empty_identity' });
  }
  return rows;
}

fs.mkdirSync(datasetDir, { recursive: true });
const richLabeled = buildRichLabeled();
writeCsv('sample_labeled.csv', richLabeled, __dirname);
writeCsv('datasets_partial_scores.csv', buildPartialDataset());
writeCsv('datasets_messy_crm_export.csv', buildMessyCrmExport());
writeCsv('datasets_duplicate_conflicts.csv', buildDuplicateDataset());

console.log(`[datasets] wrote ${richLabeled.length} labeled rows to benchmark/sample_labeled.csv`);
console.log('[datasets] wrote 120 partial-score, 180 messy-import, and 70 duplicate/conflict rows to benchmark/datasets/');

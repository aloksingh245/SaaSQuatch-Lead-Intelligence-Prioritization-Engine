const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'services', 'generator.js');

let code = fs.readFileSync(file, 'utf8');

// The DB schema doesn't have a 'technology' column on the leads table.
// We need to remove it from the INSERT query.
code = code.replace(
  'INSERT INTO leads (domain, company_name, industry, employees, revenue, country, technology)\n           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
  'INSERT INTO leads (domain, company_name, industry, employees, revenue, country)\n           VALUES ($1, $2, $3, $4, $5, $6) RETURNING id'
);

code = code.replace(
  '[normalized.domain, normalized.company_name, normalized.industry, normalized.employees, normalized.revenue, normalized.country, normalized.technology]',
  '[normalized.domain, normalized.company_name, normalized.industry, normalized.employees, normalized.revenue, normalized.country]'
);

fs.writeFileSync(file, code);
console.log('✅ Patched generator.js to match DB schema.');

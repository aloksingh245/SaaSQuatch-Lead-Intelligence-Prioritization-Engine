const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'services', 'generator.js');

let code = fs.readFileSync(file, 'utf8');

// The scorer returns 'score', not 'totalScore'.
code = code.replace(/scoreData\.totalScore/g, 'scoreData.score');

fs.writeFileSync(file, code);
console.log('✅ Patched generator.js for correct score property.');

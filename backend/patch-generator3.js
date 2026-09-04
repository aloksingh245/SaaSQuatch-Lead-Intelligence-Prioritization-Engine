const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'src', 'services', 'generator.js');

let code = fs.readFileSync(file, 'utf8');

// The scorer returns 'componentScores', not 'components'.
code = code.replace(/scoreData\.components/g, 'scoreData.componentScores');

fs.writeFileSync(file, code);
console.log('✅ Patched generator.js for correct componentScores property.');

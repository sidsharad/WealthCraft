const fs = require('fs');

const text = fs.readFileSync('lint-output.txt', 'utf8');
const lines = text.split('\n');

const fileErrors = {};
let currentFile = '';

let totalErrors = 0;
let totalWarnings = 0;

for (const line of lines) {
  if (line.startsWith('C:\\') && !line.includes('error') && !line.includes('warning') && !line.includes('eslint')) {
    currentFile = line.trim().split('wealthcraft\\')[1] || line.trim();
    if (!fileErrors[currentFile]) fileErrors[currentFile] = { errors: 0, warnings: 0 };
  } else if (line.includes(' error ')) {
    if (currentFile) fileErrors[currentFile].errors++;
    totalErrors++;
  } else if (line.includes(' warning ')) {
    if (currentFile) fileErrors[currentFile].warnings++;
    totalWarnings++;
  }
}

const sorted = Object.entries(fileErrors)
  .sort((a, b) => b[1].errors - a[1].errors)
  .slice(0, 10);

console.log('--- Top 10 Files (Errors) ---');
sorted.forEach(([file, counts], i) => {
  console.log(`${i+1}. ${file}: ${counts.errors} errors, ${counts.warnings} warnings`);
});

let prodCodeErrors = 0;
let testErrors = 0;
let apiErrors = 0;
let componentErrors = 0;
let diagErrors = 0;
let engineErrors = 0;

for (const [file, counts] of Object.entries(fileErrors)) {
  if (file.includes('test') || file.includes('__tests__')) testErrors += counts.errors;
  else if (file.includes('scratch') || file.includes('diag') || file.includes('audit')) diagErrors += counts.errors;
  else if (file.includes('components')) componentErrors += counts.errors;
  else if (file.includes('api')) apiErrors += counts.errors;
  else if (file.includes('lib\\game-engine')) engineErrors += counts.errors;
  else prodCodeErrors += counts.errors;
}

console.log('\n--- Categories (Errors Only) ---');
console.log(`Production App Code: ${prodCodeErrors}`);
console.log(`Components: ${componentErrors}`);
console.log(`Game Engine: ${engineErrors}`);
console.log(`API Routes: ${apiErrors}`);
console.log(`Tests: ${testErrors}`);
console.log(`Diagnostics/Scratch: ${diagErrors}`);
console.log(`Total Errors: ${totalErrors}`);
console.log(`Total Warnings: ${totalWarnings}`);

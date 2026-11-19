// Inlines src/engine.js into src/app.html and writes a single self-contained dist/index.html.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src/app.html'), 'utf8');
const engine = fs.readFileSync(path.join(root, 'src/engine.js'), 'utf8');

if (!template.includes('/*ENGINE*/')) {
  console.error('src/app.html is missing the /*ENGINE*/ placeholder');
  process.exit(1);
}

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = template.replace('/*ENGINE*/', () => engine);
fs.writeFileSync(path.join(root, 'dist/index.html'), out);
console.log(`Built dist/index.html (${(out.length / 1024).toFixed(1)} KB)`);

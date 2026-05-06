#!/bin/bash
# kebab-case-check.sh — validates all source files are kebab-case
# Run: node --experimental-vm-modules scripts/kebab-case-check.js

const { execSync } = require('child_process');
const path = require('path');

const root = __dirname;

function isKebabCase(basename) {
  if (basename.startsWith('.')) return true;
  if (/^index\.(tsx?|jsx?)$/.test(basename)) return true;
  if (/^route\.(tsx?|jsx?)$/.test(basename)) return true;
  if (/\.(test|spec)\.(tsx?|jsx?)$/.test(basename)) return true;
  if (/^[a-z]+\.(config|types)\.(tsx?|jsx?)$/.test(basename)) return true;
  if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*\.(tsx?|ts|jsx?|js)$/.test(basename)) return true;
  return false;
}

const dirs = [
  path.join(root, 'apps/forge/src'),
  path.join(root, 'apps/forge-admin/src'),
  path.join(root, 'packages/forge-runtime-core/src'),
];

let violations = [];

for (const dir of dirs) {
  try {
    const output = execSync(
      `find "${dir}" -type f \\( -name "*.ts" -o -name "*.tsx" -o -name "*.js" -o -name "*.jsx" \\) 2>/dev/null | grep -v node_modules | grep -v dist | grep -v .turbo`,
      { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 }
    ).trim();
    if (!output) continue;

    const files = output.split('\n').filter(Boolean);
    for (const file of files) {
      const basename = path.basename(file);
      if (!isKebabCase(basename)) {
        violations.push({ file, basename });
      }
    }
  } catch (e) {
    // empty dir
  }
}

if (violations.length > 0) {
  console.log(`❌ Found ${violations.length} kebab-case violations:`);
  violations.forEach(({ file, basename }) => {
    console.log(`  ${file}`);
  });
  process.exit(1);
} else {
  console.log('✅ All source files follow kebab-case naming');
  process.exit(0);
}
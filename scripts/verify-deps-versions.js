/**
 * Verify dependency versions are consistent across packages
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

function getPackageJson(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function collectDependencies(pkgJson, pkgName) {
  const deps = {};
  const fields = ['dependencies', 'devDependencies', 'peerDependencies'];

  for (const field of fields) {
    if (pkgJson[field]) {
      for (const [name, version] of Object.entries(pkgJson[field])) {
        if (!deps[name]) deps[name] = {};
        deps[name][pkgName] = version;
      }
    }
  }
  return deps;
}

function findPackages(dir) {
  const pkg = getPackageJson(dir);
  if (!pkg) return [];

  const packages = [];

  // Check apps and packages directories
  const subDirs = ['apps', 'packages'];
  for (const subDir of subDirs) {
    try {
      const entries = readdirSync(join(dir, subDir));
      for (const entry of entries) {
        const pkgPath = join(dir, subDir, entry);
        const pkgJson = getPackageJson(pkgPath);
        if (pkgJson) packages.push(pkgPath);
      }
    } catch {}
  }

  return packages;
}

// Main execution
const rootPkg = getPackageJson(rootDir);
if (!rootPkg) {
  console.error('No package.json found at root');
  process.exit(1);
}

console.log('Verifying dependency versions across packages...\n');

const allDeps = {};
const packages = findPackages(rootDir);
packages.push(rootDir); // Include root package

for (const pkg of packages) {
  const pkgJson = getPackageJson(pkg);
  if (!pkgJson) continue;

  const pkgName = pkg.replace(rootDir + '/', '') || 'root';
  const pkgDeps = collectDependencies(pkgJson, pkgName);
  for (const [name, versions] of Object.entries(pkgDeps)) {
    if (!allDeps[name]) allDeps[name] = {};
    Object.assign(allDeps[name], versions);
  }
}

// Find inconsistencies
const issues = [];
for (const [dep, versions] of Object.entries(allDeps)) {
  const uniqueVersions = new Set(Object.values(versions));
  if (uniqueVersions.size > 1) {
    const pkgList = Object.entries(versions)
      .map(([pkgName, v]) => `  - ${pkgName}: ${v}`)
      .join('\n');
    issues.push(`${dep}:\n${pkgList}`);
  }
}

if (issues.length > 0) {
  console.error('❌ Found version inconsistencies:\n');
  console.error(issues.join('\n\n'));
  console.error('\n---');
  console.error('Tip: Add "overrides" field in root package.json to enforce versions');
  console.error('Example: { "overrides": { "react": "18.3.1" } }');
  process.exit(1);
} else {
  console.log('✅ All dependencies have consistent versions');
  process.exit(0);
}

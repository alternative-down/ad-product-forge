import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, test, expect } from 'vitest';

const repoRoot = resolve(__dirname, '../..');
const packageJsonPath = resolve(__dirname, 'package.json');
const tsupConfigPath = resolve(__dirname, 'tsup.config.ts');

describe('tsup migrations build configuration (L#19 tripwire for #5674)', () => {
  test('package.json build script copies migrations/ to dist/migrations/', () => {
    const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    const buildScript: string = pkg.scripts.build;
    expect(buildScript).toMatch(/mkdir -p dist\/migrations/);
    expect(buildScript).toMatch(/cp -R migrations\/\. dist\/migrations\//);
  });

  test('tsup config does NOT use publicDir (which would unnest folder structure)', () => {
    const config = readFileSync(tsupConfigPath, 'utf-8');
    // publicDir unnests folder contents to outDir, breaking the migrations/ structure
    // that the drizzle migrator expects at process.cwd()/migrations/meta/_journal.json
    // (re-introducing publicDir: 'migrations' was the WRONG fix attempted first — see
    // PR body for #5674 chronology)
    expect(config).not.toMatch(/publicDir:\s*['"]migrations['"]/);
  });
});

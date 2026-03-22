import fs from 'node:fs/promises';
import path from 'node:path';

const distRoot = path.resolve(process.cwd(), process.argv[2] ?? 'dist');

async function listJavaScriptFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listJavaScriptFiles(entryPath)));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

async function resolveRuntimeSpecifier(filePath, specifier) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
    return null;
  }

  if (specifier.endsWith('.js') || specifier.endsWith('.json') || specifier.endsWith('.node')) {
    return null;
  }

  const basePath = path.resolve(path.dirname(filePath), specifier);
  const directModulePath = `${basePath}.js`;

  try {
    const directModuleStat = await fs.stat(directModulePath);
    if (directModuleStat.isFile()) {
      return `${specifier}.js`;
    }
  } catch {}

  const directoryModulePath = path.join(basePath, 'index.js');

  try {
    const directoryModuleStat = await fs.stat(directoryModulePath);
    if (directoryModuleStat.isFile()) {
      return `${specifier}/index.js`;
    }
  } catch {}

  return null;
}

async function rewriteFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  const matches = [...source.matchAll(/(from\s+['"]|import\s*\(\s*['"]|export\s+\*\s+from\s+['"])([^'"]+)(['"]\s*\)?)/g)];

  if (matches.length === 0) {
    return false;
  }

  let nextSource = source;

  for (const match of matches) {
    const [fullMatch, prefix, specifier, suffix] = match;
    const replacementSpecifier = await resolveRuntimeSpecifier(filePath, specifier);

    if (!replacementSpecifier) {
      continue;
    }

    nextSource = nextSource.replace(fullMatch, `${prefix}${replacementSpecifier}${suffix}`);
  }

  if (nextSource === source) {
    return false;
  }

  await fs.writeFile(filePath, nextSource, 'utf8');
  return true;
}

const files = await listJavaScriptFiles(distRoot);

for (const filePath of files) {
  await rewriteFile(filePath);
}

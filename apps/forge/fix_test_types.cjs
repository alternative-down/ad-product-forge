#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const CWD = __dirname;

function readLines(p) {
  return fs.readFileSync(path.join(CWD, p), 'utf8').split('\n');
}

function writeLines(p, lines) {
  fs.writeFileSync(path.join(CWD, p), lines.join('\n'));
}

function fixFile(p, fixes) {
  const lines = readLines(p);
  let fixed = 0;
  for (const { line: n, find, replace } of fixes) {
    const idx = n - 1;
    if (lines[idx].trim() === find.trim()) {
      lines[idx] = lines[idx].replace(find.trim(), replace.trim());
      fixed++;
    } else {
      console.log(`  WARN line ${n}: "${lines[idx].trim()}" !== "${find.trim()}"`);
    }
  }
  if (fixed > 0) {
    writeLines(p, lines);
    console.log(`  Fixed ${fixed} in ${p}`);
  }
}

// 1. agent-contract-store.test.ts
fixFile('src/agents/agent-contract-store.test.ts', [
  { line: 135, find: 'v as ContractRow', replace: 'v as unknown as ContractRow' },
  { line: 136, find: 'v as StepRow', replace: 'v as unknown as StepRow' },
  { line: 166, find: 'let createAgentContractStore: (db: unknown) => ReturnType<typeof import', replace: 'let createAgentContractStore: (db: Database) => ReturnType<typeof import' },
]);

// 2. agent-embedder-maintenance.test.ts
fixFile('src/agents/agent-embedder-maintenance.test.ts', [
  { line: 177, find: 'expect(databaseDbAccessCall!).toBeDefined();', replace: 'expect((databaseDbAccessCall as any)!).toBeDefined();' },
]);

// 3. agent-long-term-memory-recall.test.ts
fixFile('src/agents/agent-long-term-memory-recall.test.ts', [
  { line: 691, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
  { line: 743, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
  { line: 813, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
  { line: 873, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
  { line: 942, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
  { line: 1017, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
  { line: 1076, find: 'persistenceStore,', replace: 'persistenceStore: persistenceStore as any,' },
]);

// 4. agent-long-term-memory-store.test.ts
fixFile('src/agents/agent-long-term-memory-store.test.ts', [
  { line: 159, find: 'packages: [],', replace: 'packages: [] as any,' },
]);

// 5. agent-long-term-memory.test.ts — add missing methods to createAgentContractStore mock
// Find the line that defines createAgentContractStore mock and add missing methods
const ltmLines = readLines('src/agents/agent-long-term-memory.test.ts');
// Find the createAgentContractStore mock definition (should be around lines 40-80)
// We need to add: getExecutionState, setExecutionState, setExecutionAbsent, refundActiveContractBalance
// Let me find the mock block
let found = false;
for (let i = 0; i < ltmLines.length; i++) {
  const l = ltmLines[i];
  // Look for the mock with getRunnableContract and add missing methods
  if (l.includes('createAgentContractStore: vi.fn') || l.includes('createAgentContractStore: vi.fn(')) {
    // Find the closing of this object
    let j = i;
    let depth = 0;
    let started = false;
    while (j < ltmLines.length) {
      const cl = ltmLines[j];
      for (const ch of cl) { if (ch === '{') { depth++; started = true; } if (ch === '}') depth--; }
      if (started && depth === 0) break;
      j++;
    }
    // Now we know the mock block ends at j
    // Find 'refundActiveContractBalance' or the last method
    // Look for 'recordAgentStep' as a reference point
    let insertIdx = -1;
    for (let k = i; k <= j; k++) {
      if (ltmLines[k].includes('getContractSpend:') || ltmLines[k].includes('recordAgentStep:')) {
        insertIdx = k + 1;
        break;
      }
    }
    if (insertIdx > 0 && !ltmLines[insertIdx].includes('getExecutionState')) {
      const indent = ltmLines[insertIdx].match(/^(\s*)/)[1];
      const newMethods = `,\n${indent}getExecutionState: vi.fn(async () => 'idle' as const),\n${indent}setExecutionState: vi.fn(async () => {}),\n${indent}setExecutionAbsent: vi.fn(async () => {}),\n${indent}refundActiveContractBalance: vi.fn(async () => ({ refunded: false, reason: null })),`;
      ltmLines[insertIdx] = ltmLines[insertIdx].trimEnd() + newMethods;
      found = true;
      break;
    }
  }
}
if (found) {
  writeLines('src/agents/agent-long-term-memory.test.ts', ltmLines);
  console.log('  Fixed agent-long-term-memory.test.ts — added missing contract store methods');
} else {
  console.log('  WARN: could not find createAgentContractStore mock in agent-long-term-memory.test.ts');
}

console.log('Done.');

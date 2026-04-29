#!/usr/bin/env python3
"""Fix TypeScript type errors in test files."""
import re
import sys

def fix_file(path, fixes):
    with open(path, 'r') as f:
        lines = f.readlines()
    
    modified = False
    for (line_no, old, new) in fixes:
        idx = line_no - 1
        if lines[idx].strip() == old.strip():
            lines[idx] = lines[idx].replace(old.strip(), new.strip()) + '\n'
            modified = True
        else:
            print(f"  WARN: line {line_no} doesn't match: {lines[idx].strip()!r}")
            print(f"         expected:     {old.strip()!r}")
    
    if modified:
        with open(path, 'w') as f:
            f.writelines(lines)
        print(f"  Fixed {path}")

# 1. agent-contract-store.test.ts
fix_file('src/agents/agent-contract-store.test.ts', [
    # line 135: v as ContractRow → v as unknown as ContractRow
    (135, 'v as ContractRow', 'v as unknown as ContractRow'),
    # line 136: v as StepRow → v as unknown as StepRow
    (136, 'v as StepRow', 'v as unknown as StepRow'),
    # line 166: (db: unknown) → (db: Database)
    (166, 'let createAgentContractStore: (db: unknown) => ReturnType<typeof import', 'let createAgentContractStore: (db: Database) => ReturnType<typeof import'),
])

# 2. agent-embedder-maintenance.test.ts
# line 177: databaseDbAccessCall! → (databaseDbAccessCall as any)!
fix_file('src/agents/agent-embedder-maintenance.test.ts', [
    (177, 'expect(databaseDbAccessCall!).toBeDefined();', 'expect((databaseDbAccessCall as any)!).toBeDefined();'),
])

# 3. agent-long-term-memory-recall.test.ts — persistenceStore cast
# lines 691, 743, 813, 873, 942, 1017, 1076
recall_fixes = []
for line in [691, 743, 813, 873, 942, 1017, 1076]:
    recall_fixes.append((line, 'persistenceStore,', 'persistenceStore: persistenceStore as any,'))
fix_file('src/agents/agent-long-term-memory-recall.test.ts', recall_fixes)

# 4. agent-long-term-memory-store.test.ts
# line 159: packages: [], → packages: [] as any,
fix_file('src/agents/agent-long-term-memory-store.test.ts', [
    (159, 'packages: [],', 'packages: [] as any,'),
])

print("Done.")

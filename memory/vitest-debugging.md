# Vitest — Debugging Failed Tests

## Always run a single test first

```bash
node_modules/.bin/vitest run path/to/file.test.ts -t "test name"
```

This isolates the failure and gives a clean stack trace.

## Common error patterns

### "orderBy is not a function"
Drizzle chain mock broken. `where()` didn't return the terminal node.
Fix: `terminal.where = vi.fn().mockReturnValue(terminal)` — NOT async, NOT mockImplementation returning terminal.

### "X is not a function"
The mock function wasn't set on the right object. Check:
- Is the mock set on the actual object returned from `makeMockDb`?
- Did a spread `{...obj}` create a new object without the mock?
- Is the method called on the right chain node?

### "terminal is not defined"
The `terminal` variable is defined inside a block but referenced in `return {}` outside that block. Move terminal definition to function scope.

### "Expected `}` but found `EOF`"
Python string replacement corrupted the file structure. The inserted text may have unbalanced braces.
Fix: restore from git (`git checkout -- file`) and redo.

## Checking what the mock actually returns

Add a debug assertion:
```ts
expect(typeof terminal.orderBy).toBe('function');
expect(typeof terminal.where).toBe('function');
```

This fails at test setup, not at runtime, which is clearer.

## For archiveConversationByAccount delete chain

```ts
let deleteCallCount = 0;
deleteChain.where = vi.fn().mockImplementation(async () => {
  deleteCallCount++;
  if (overrides.deleteError && deleteCallCount === 2) throw overrides.deleteError;
  return { rowsAffected: overrides.deleteRowsAffected ?? 1 };
});
```
Call-count tracking lets you simulate the SECOND delete (conversation) failing while first (member) succeeds.
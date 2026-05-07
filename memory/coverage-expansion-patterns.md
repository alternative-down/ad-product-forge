# Coverage Expansion — Patterns & Learnings

## Workflow

1. Pick module with zero or low coverage
2. Read the source file first to understand what it does
3. Check existing test file — if 0 tests, need to create from scratch; if some exist, expand
4. Write tests, run immediately to verify
5. Commit, push, create PR, notify Thoren

## Branch naming

`fix/1796{model}-internal-chat-{module}-tests` where model is a letter incrementing from j (1796j, 1796k, 1796l...).

## PR naming

`test(1796{model}): {n} tests for {filename}.ts (context)`

## Mock patterns by module type

### Pure passthrough (groups-account style)
Delegates to deps — just verify args passed through and errors rethrown.
```ts
const deps = { fn: vi.fn().mockResolvedValue({ success: true }) };
// test: calls with correct args, passes through result, rethrows error
```

### DB + deps (messages style)
Need terminal-node mock for Drizzle chains. See `memory/drizzle-orm-mock-patterns.md`.

### DB-only with complex chains (attachments style)
```ts
db.query.{table}.findMany = vi.fn().mockResolvedValue(rows);
db.insert = vi.fn().mockImplementation(() => ({ values: vi.fn().mockResolvedValue([{}]) }));
```

## When tests fail with "X is not a function"

Usually means the Drizzle chain mock is broken. Check:
- Did `where()` return the right object? (not async, must return terminal)
- Is `selectNode` actually accessible in the return statement?
- Did spread operator create a new object without mocks?

## Credential management

Git tokens expire. Use `get_github_git_credentials` every time before push, then set remote URL.

## Git remote setup (after token refresh)
```bash
git remote set-url origin "https://x-access-token:{TOKEN}@github.com/{owner}/{repo}.git"
```

## Thoren communication template
"Coverage PR up: #{number} — {n} tests for {module}. Covers {key behaviors}. All {n} tests passing. Branch: {branch} from {SHA}."
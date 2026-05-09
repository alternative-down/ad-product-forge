# Coverage Expansion — Patterns & Learnings

## Workflow

1. Pick module with zero or low coverage
2. Read the source file first to understand what it does
3. Check existing test file — if 0 tests, need to create from scratch; if some exist, expand
4. Write tests, run immediately to verify
5. Commit, push, create PR, notify Thoren

## Branch naming

`fix/1796{model}-{module}-tests` where model is a letter incrementing from j (1796j, 1796k, 1796l...).
Each task from Thoren picks the next letter in the sequence.

## PR naming

`test(1796{model}): {n} tests for {filename}.ts (context)`

## Mock patterns by module type

### Pure passthrough (groups-account style)
Delegates to deps — just verify args passed through and errors rethrown.

### In-memory store (no I/O)
Create store, call methods, verify state changes.
```ts
const store = new InMemoryConversationStore();
await store.upsertThread(thread);
const result = await store.getThread('id');
expect(result).toMatchObject({ id, title });
```

### Zod schema validation
Test parse (throws) and safeParse (returns object) for valid and invalid inputs.
Remember: `.passthrough()` keeps unknown fields — use `toHaveProperty` not `not.toHaveProperty` for unknown field tests.

### OAuth/credential sync (external HTTP + file I/O)
Use a shared mock object set via `vi.mock('./store.js', ...)` before dynamic import.
```ts
const mockStore = {
  readJsonFile: vi.fn<[string], Promise<unknown>>(),
  read: vi.fn<[string?], Promise<Record<string, OAuthCredential>>>(),
  write: vi.fn<[string, OAuthCredential, string?], Promise<void>>(),
  isExpired: vi.fn<[OAuthCredential, number?], boolean>(),
};
vi.mock('./store.js', () => ({ oauthStore: mockStore, OAuthCredential: {} as any }));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Reconfigure per-test with beforeEach + mockStore.fn.mockResolvedValue(...)
// After each test, clear with vi.clearAllMocks()
```

Key lesson: `vi.mock` is hoisted to the top of the file by Vitest. Dynamic imports after it work correctly — the module uses the mocked deps. Using a shared `mockStore` object (reconfigured per-test via `mockResolvedValue`) is simpler and more reliable than re-mocking with `vi.doMock()` inside tests.

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

## OAuth test: `toHaveBeenCalledWith` with `expect.objectContaining`

When the actual object has extra fields (expires, accountId) that `mockStore.getDefaultPath()` adds, `toHaveBeenCalledWith` with `undefined` as the third argument fails.
Fix: use array destructuring on `mock.calls`:
```ts
const [[provider, cred]] = mockStore.write.mock.calls;
expect(provider).toBe('openai-codex');
expect(cred).toMatchObject({ access: 'new-access' });
```
This ignores extra fields and checks only what matters.

## Credential management

Git tokens expire ~1 hour. Use `get_github_git_credentials` every time before push, then update remote URL. See `memory/github-credentials.md`.

## Git remote setup (after token refresh)
```bash
git remote set-url origin "https://x-access-token:{TOKEN}@github.com/alternative-down/ad-product-forge.git"
git push origin branch-name --force
```

## Thoren communication template
"Coverage PR up: #{number} — {n} tests for {module}. Covers {key behaviors}. All {n} tests passing. Branch: {branch} from {SHA}."
# Drizzle ORM Mock Patterns

## The problem

Drizzle query chains are deeply fluent — each method returns a new object with its own type. The chain:

```ts
db.select().from(t).innerJoin(...).where(...).orderBy(...).offset(...).limit(...).all()
```

Each step returns a different type. A naive mock returning `mockReturnThis()` doesn't work because the returned object must have the right methods for the NEXT step.

## The terminal-node pattern (works reliably)

```ts
const terminal: Record<string, unknown> = {};
terminal.orderBy = vi.fn().mockReturnValue(terminal);
terminal.offset = vi.fn().mockReturnValue(terminal);
terminal.limit = vi.fn().mockReturnValue(terminal);
terminal.all = vi.fn().mockResolvedValue([]);
terminal.where = vi.fn().mockReturnValue(terminal);
terminal.from = vi.fn().mockReturnValue(terminal);
terminal.innerJoin = vi.fn().mockReturnValue(terminal);

return {
  select: vi.fn().mockReturnValue(terminal),
  delete: vi.fn().mockReturnValue(deleteChain),
  update: vi.fn().mockReturnValue(updateChain),
  query: { /* query helpers */ },
};
```

Key rules:
- `where()` MUST return the terminal (NOT `async () => terminal`) — synchronous fluent pattern
- `all()` returns the rows — async
- All other methods return `terminal` (the same object) so any call order is valid
- DO NOT use spread (`{ ...terminal }`) — it creates a new object without the mock functions

## For archiveConversationByAccount (delete chains)

```ts
let deleteCallCount = 0;
const deleteChain: Record<string, unknown> = {};
deleteChain.where = vi.fn().mockImplementation(async () => {
  deleteCallCount++;
  if (overrides.deleteError && deleteCallCount === 2) throw overrides.deleteError;
  return { rowsAffected: overrides.deleteRowsAffected ?? 1 };
});
deleteChain.set = vi.fn().mockReturnThis();
```

Track call count to simulate second (conversation) delete failing.

## Files using this pattern

- `apps/forge/src/communication/internal-chat-messages.test.ts` — full example
- `apps/forge/src/communication/internal-chat-unread.test.ts` — simpler select chain
- `apps/forge/src/communication/internal-chat-conversations.test.ts` — insert + query
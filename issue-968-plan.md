# Issue #968: Extract connection layer

## What's being extracted
- `handlers` map, `onReceiveMessage`, `clearHandler`, `replayUnreadMessages` + its dependencies
- New file: `internal-chat-connection.ts`

## Plan
1. Branch from develop
2. Create `internal-chat-connection.ts`
3. Update `internal-chat-service.ts` to delegate
4. Tests pass
5. Push + PR

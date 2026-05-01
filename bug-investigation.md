# Bug Investigation — #1059, #1057

## #1059 — LTM Recall fields missing from client SystemSettings type

### Backend (schema.ts)
```ts
ltmRecallSearchMode          // 'hybrid' | 'vector' | 'graph'
ltmRecallWorkspaceTopK       // integer
ltmRecallGraphTopK           // integer  
ltmRecallGraphThreshold      // real
ltmRecallGraphRandomWalkSteps // integer
ltmRecallGraphIncludeSources // integer
ltmRecallScoreThreshold      // real  ✓ in client type
ltmRecallDocumentCount       // integer  ✓ in client type
```

### Client (forge-admin/src/lib/admin-api/system-types.ts)
```ts
ltmRecallScoreThreshold: number;  // ✓ present
ltmRecallDocumentCount: number;   // ✓ present
// MISSING: ltmRecallSearchMode, ltmRecallWorkspaceTopK, ltmRecallGraphTopK,
//          ltmRecallGraphThreshold, ltmRecallGraphRandomWalkSteps, 
//          ltmRecallGraphIncludeSources
```

### Bug Mechanism
Frontend uses `...settingsQuery.data` spread when saving. Since client type
(SystemSettings) omits the 6 missing fields, any save operation strips them
from the payload → backend upsert writes `DEFAULT` values → LTM recall config
gets silently reset to defaults.

### Fix Approach
Add the 6 missing fields to `forge-admin/src/lib/admin-api/system-types.ts`
`SystemSettings` type. The backend handles these correctly (schema + Drizzle
handle defaults correctly), the issue is purely client-side type omission.

### Files to change
- apps/forge-admin/src/lib/admin-api/system-types.ts

---

## #1057 — OAuth endpoint returns Record, client expects providers[]

### Backend (admin/routes/system/read.ts + write.ts)
```ts
// Returns: Record<string, { sourcePath, sourcePresent, synced, hasRefresh, expiresAt, accountId }>
async function readOauthState() {
  const state = await store.read();
  const result: Record<string, {...}> = {};
  for (const [providerId, credential] of Object.entries(state)) {
    result[providerId] = { ... };
  }
  return result; // e.g. { "openai-codex": {...}, "anthropic": {...} }
}
```

### Client (forge-admin/src/lib/admin-api/system-types.ts)
```ts
export type SystemOauthState = {
  storePath: string;
  providers: Array<{
    providerId: 'openai-codex' | 'anthropic';
    sourcePath: string;
    sourcePresent: boolean;
    synced: boolean;
    hasRefresh: boolean;
    expiresAt: number | null;
    accountId: string | null;
  }>;
};
```

### Bug Mechanism
Frontend expects `{ storePath, providers: [...] }` but backend returns
`Record<providerId, providerData>` (no `storePath`, no `providers` wrapper,
no `providerId` field inside entries — data is flat at entry level).

### Fix Approach (two options)
A) Transform at the client consumer sites — parse the Record into the
   expected `providers[]` shape. No change to backend.
B) Change backend to match the expected contract: return `{ storePath, providers: [...] }`
   where each provider entry contains `providerId`.

Option B is more correct — the contract should be consistent. The backend
should return the shape the client expects.

### Files to check
- admin/routes/system/read.ts (GET /admin/system/oauth handler)
- admin/routes/system/write.ts (has duplicate readOauthState)
- forge-admin: where is SystemOauthState consumed?

---

## Status
- Both bugs investigated and root causes identified.
- GitHub dispatch TBD (token may lack assignee permission).
- Ready to implement fixes after current PR #1094 merges (or branch off new fix branch).
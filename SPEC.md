# Spec: #5314 — Dead Code in system-integrations/store.ts

## Motivation

`isEnabled: input.isEnabled === false ? false : true` is logically equivalent to `!!input.isEnabled` — always evaluates to the boolean value of `input.isEnabled`. This is dead code.

## Change

**Before:**
```ts
isEnabled: input.isEnabled === false ? false : true,
```

**After:**
```ts
isEnabled: !!input.isEnabled,
```

Same fix pattern used for #5312 in `agents-list.ts`.

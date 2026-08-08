export function isForgeDebugEnabled() {
  return process.env.FORGE_DEBUG === '1' || process.env.FORGE_DEBUG === 'true';
}

// 1-object-arg overload (L#NN-50 #18 v10): accepts the { scope, level, message, context? } form
// used by 469+ call sites across apps/forge/src. The level field is now actually used in
// dev log output (prefix format [forge:scope:level]) instead of being silently dropped.
// The index signature [key: string]: unknown allows call sites to add custom top-level
// fields (e.g., agentId, runtimeId) without TypeScript excess-property errors.
// The level is typed as string (not the strict union) to be backwards-compatible with
// callback type definitions that use level: string for flexibility. Convention is to use
// debug / info / warn / error but the function accepts any string at type level.
export function forgeDebug(opts: {
  scope: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
  [key: string]: unknown;
}): void;
// 3-positional-arg form (existing, unchanged, backwards compat for D38 #6300 migaduManagerDebug)
export function forgeDebug(scope: string, message: string, data?: Record<string, unknown>): void;
export function forgeDebug(
  scopeOrOpts:
    | string
    | {
        scope: string;
        level: string;
        message: string;
        context?: Record<string, unknown>;
        [key: string]: unknown;
      },
  message?: string,
  data?: Record<string, unknown>,
): void {
  if (!isForgeDebugEnabled()) return;

  if (typeof scopeOrOpts === 'string') {
    // 3-positional-arg form (existing behavior, backwards compat)
    const prefix = `[forge:${scopeOrOpts}]`;
    if (data && hasKeys(data)) {
      console.log(prefix, message, data);
      return;
    }
    console.log(prefix, message);
    return;
  }

  // 1-object-arg form (L#NN-50 #18 v10)
  const opts = scopeOrOpts;
  const prefix = `[forge:${opts.scope}:${opts.level}]`;
  if (opts.context && hasKeys(opts.context as Record<string, unknown>)) {
    console.log(prefix, opts.message, opts.context);
    return;
  }
  console.log(prefix, opts.message);
}

// Check if object has any keys with O(1) early exit
function hasKeys(obj: Record<string, unknown>): boolean {
  for (const _ in obj) return true;
  return false;
}

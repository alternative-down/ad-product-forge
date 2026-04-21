export function isForgeDebugEnabled() {
  return process.env.FORGE_DEBUG === '1' || process.env.FORGE_DEBUG === 'true';
}

export function forgeDebug(scope: string, message: string, data?: Record<string, unknown>) {
  if (!isForgeDebugEnabled()) {
    return;
  }

  const prefix = `[forge:${scope}]`;

  if (data && hasKeys(data)) {
    console.log(prefix, message, data);
    return;
  }

  console.log(prefix, message);
}

function hasKeys(value: Record<string, unknown>) {
  for (const _ in value) {
    return true;
  }

  return false;
}

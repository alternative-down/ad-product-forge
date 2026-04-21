const FORGE_SAFE_IDENTIFIER_PATTERN = /[^A-Za-z0-9_]/g;

export function toForgeSafeIdentifier(value: string) {
  const normalized = value.replace(FORGE_SAFE_IDENTIFIER_PATTERN, '_');

  if (/^[A-Za-z_]/.test(normalized)) {
    return normalized;
  }

  return `_${normalized}`;
}

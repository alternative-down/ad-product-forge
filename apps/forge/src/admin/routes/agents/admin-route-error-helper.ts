import { forgeDebug } from '@forge-runtime/core';
import { jsonResponse } from '../helpers';

export function adminRouteError(error: unknown) {
  forgeDebug({
    scope: 'admin',
    level: 'error',
    message: 'Admin route failed',
    context: { error: error instanceof Error ? error.message : String(error) },
  });
  return jsonResponse(
    { error: error instanceof Error ? error.message : String(error) },
    500,
  );
}
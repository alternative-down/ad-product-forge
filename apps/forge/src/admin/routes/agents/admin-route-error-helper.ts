import { forgeDebug } from '@forge-runtime/core';
import { jsonResponse } from '../helpers';

export function adminRouteError(error: unknown) {
  forgeDebug({
    scope: 'admin',
    level: 'error',
    message: 'Admin route failed',
    context: { error: String(serializeError(error)) },
  });
  return jsonResponse(
    { error: String(serializeError(error)) },
    500,
  );
}
import { serializeError } from '../../../agents/agent-runner-error-formatting';
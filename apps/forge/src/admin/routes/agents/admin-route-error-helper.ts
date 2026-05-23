import { errorMsg } from '../../../agents/agent-runner-error-formatting';
import { forgeDebug } from '@forge-runtime/core';
import { jsonResponse } from '../helpers';

export function adminRouteError(error: unknown) {
  forgeDebug({
    scope: 'admin',
    level: 'error',
    message: 'Admin route failed',
    context: { error: errorMsg(error) },
  });
  return jsonResponse({ error: errorMsg(error) }, 500);
}

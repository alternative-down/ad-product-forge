import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../../agents/error-formatting';
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

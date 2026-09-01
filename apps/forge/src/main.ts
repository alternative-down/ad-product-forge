import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';
import { createForgeBootstrap } from './forge-bootstrap';
import { parseEnv } from './config/env';

// Global exception handlers — must be registered before any async work
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

export async function main() {
  mainDebug('info', '[forge-startup] main: creating bootstrap');
  const bootstrap = await createForgeBootstrap();
  const env = parseEnv();
  mainDebug('info', `[forge-startup] main: starting http server on port ${bootstrap.publicBaseUrl}`);
  await bootstrap.httpServer.start();
  mainDebug('info', `[forge-startup] main: HTTP server listening on port ${env.FORGE_HTTP_PORT}`);
  mainDebug('info', `Forge HTTP server started on port ${env.FORGE_HTTP_PORT}`);

  mainDebug('info', `Admin API key: ${bootstrap.adminApiKey !== null && bootstrap.adminApiKey !== undefined ? 'configured' : 'NOT configured'}`);
  if (bootstrap.allowInsecureLocal) {
    console.warn(
      '[forge-main] WARNING: Admin routes served WITHOUT authentication.' +
        ' Set FORGE_ADMIN_API_KEY for production deployments.',
    );
  }

  const shutdown = async () => {
    mainDebug('info', 'Shutting down gracefully...');
    await bootstrap.httpServer.stop();
    await bootstrap.registry.disposeAll();
    mainDebug('info', 'Agent runtimes disposed');
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
import { serializeError } from './agents/error-formatting';

/**
 * Module-local debug helper. Centralizes the forge scope
 * so call sites only specify the level, message, and context.
 */
function mainDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
) {
  forgeDebug({ scope: 'forge', level, message, context });
}


main().catch((error) => {
  console.error('[forge-startup] FATAL: app startup failed' );
  console.error('[forge-main] Fatal error during startup:', serializeError(error));
  if (error instanceof Error && error.stack !== null && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});

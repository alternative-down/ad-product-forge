import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';
import { createForgeBootstrap } from './forge-bootstrap';

// Global exception handlers — must be registered before any async work
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
});

export async function main() {
  const bootstrap = await createForgeBootstrap();

  await bootstrap.httpServer.start();
  forgeDebug({
    scope: 'forge',
    level: 'info',
    message: `Forge HTTP server started on port ${process.env.FORGE_HTTP_PORT}`,
  });
  forgeDebug({
    scope: 'forge',
    level: 'info',
    message: `Admin API key: ${bootstrap.adminApiKey !== null && bootstrap.adminApiKey !== undefined ? 'configured' : 'NOT configured'}`,
  });
  if (bootstrap.allowInsecureLocal) {
    console.warn(
      '[forge-main] WARNING: Admin routes served WITHOUT authentication.' +
        ' Set FORGE_ADMIN_API_KEY for production deployments.',
    );
  }

  const shutdown = async () => {
    forgeDebug({ scope: 'forge', level: 'info', message: 'Shutting down gracefully...' });
    await bootstrap.httpServer.stop();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

main().catch((error) => {
  console.error(
    '[forge-main] Fatal error during startup:',
    error instanceof Error ? error.message : String(error),
  );
  if (error instanceof Error && error.stack !== null && error.stack !== undefined) {
    console.error(error.stack);
  }
  process.exit(1);
});

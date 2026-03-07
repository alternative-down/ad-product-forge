import { startApiServer } from './server.js';

void startApiServer().then((server) => {
  const address = server.address();
  if (address && typeof address === 'object') {
    // eslint-disable-next-line no-console
    console.log(`ad-product-forge api listening on :${address.port}`);
  }

  const shutdown = () => {
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
});

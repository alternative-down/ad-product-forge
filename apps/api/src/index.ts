import { startApiServer } from './server.js';

void startApiServer().then((server) => {
  const address = server.address();
  if (address && typeof address === 'object') {
    // eslint-disable-next-line no-console
    console.log(`ad-product-forge api listening on :${address.port}`);
  }
});

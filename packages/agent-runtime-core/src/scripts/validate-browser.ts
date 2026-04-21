import { PlaywrightBrowserGateway } from '../integrations/gateways/playwright-browser.js';

const gateway = new PlaywrightBrowserGateway();
const session = await gateway.createSession();

try {
  await session.navigate('https://example.com');
  const snapshot = await session.snapshot();
  const screenshot = await session.screenshot();

  console.log(JSON.stringify({
    url: snapshot.url,
    title: snapshot.title,
    textPreview: snapshot.text.slice(0, 120),
    screenshotBytes: screenshot.bytes.length,
  }, null, 2));
} finally {
  await session.close();
}


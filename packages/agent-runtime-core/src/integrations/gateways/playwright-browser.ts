import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

import type {
  BrowserGateway,
  BrowserHeaders,
  BrowserPageSnapshot,
  BrowserScreenshot,
  BrowserSession,
  BrowserSessionOptions,
} from './browser.js';

export type PlaywrightBrowserGatewayOptions = {
  launchOptions?: Parameters<typeof chromium.launch>[0];
};

export class PlaywrightBrowserGateway implements BrowserGateway {
  private readonly launchOptions: Parameters<typeof chromium.launch>[0] | undefined;

  constructor(options: PlaywrightBrowserGatewayOptions = {}) {
    this.launchOptions = options.launchOptions;
  }

  async createSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    const browser = await chromium.launch({
      headless: true,
      ...this.launchOptions,
    });
    const context = await browser.newContext({
      userAgent: options.userAgent,
      viewport: options.viewport,
      extraHTTPHeaders: options.headers,
    });
    const page = await context.newPage();

    return new PlaywrightBrowserSession({
      browser,
      context,
      page,
      headers: options.headers,
    });
  }
}

type PlaywrightBrowserSessionOptions = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  headers?: BrowserHeaders;
};

class PlaywrightBrowserSession implements BrowserSession {
  readonly id: string;
  private readonly browser: Browser;
  private readonly context: BrowserContext;
  private readonly page: Page;
  private readonly headers: BrowserHeaders | undefined;

  constructor(options: PlaywrightBrowserSessionOptions) {
    this.id = `playwright:${Date.now()}`;
    this.browser = options.browser;
    this.context = options.context;
    this.page = options.page;
    this.headers = options.headers;
  }

  async navigate(url: string): Promise<void> {
    if (this.headers) {
      await this.page.setExtraHTTPHeaders(this.headers);
    }

    await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
    });
  }

  async click(target: string): Promise<void> {
    await this.page.click(target);
  }

  async type(target: string, text: string): Promise<void> {
    await this.page.fill(target, text);
  }

  async snapshot(): Promise<BrowserPageSnapshot> {
    return {
      url: this.page.url(),
      title: await this.page.title(),
      text: await this.page.locator('body').innerText(),
    };
  }

  async screenshot(): Promise<BrowserScreenshot> {
    return {
      mimeType: 'image/png',
      bytes: await this.page.screenshot({
        type: 'png',
      }),
    };
  }

  async close(): Promise<void> {
    await this.context.close();
    await this.browser.close();
  }
}

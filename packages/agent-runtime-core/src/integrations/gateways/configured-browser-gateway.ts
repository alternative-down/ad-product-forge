import type { BrowserGateway, BrowserSession, BrowserSessionOptions } from './browser.js';

export type ConfiguredBrowserGatewayOptions = {
  base: BrowserGateway;
  userAgent?: string;
  viewport?: {
    width: number;
    height: number;
  };
  headers?: Record<string, string>;
};

export class ConfiguredBrowserGateway implements BrowserGateway {
  private readonly base: BrowserGateway;
  private readonly userAgent: string | undefined;
  private readonly viewport: BrowserSessionOptions['viewport'];
  private readonly headers: Record<string, string>;

  constructor(options: ConfiguredBrowserGatewayOptions) {
    this.base = options.base;
    this.userAgent = options.userAgent;
    this.viewport = options.viewport;
    this.headers = options.headers ?? {};
  }

  async createSession(options: BrowserSessionOptions = {}): Promise<BrowserSession> {
    return this.base.createSession({
      userAgent: options.userAgent ?? this.userAgent,
      viewport: options.viewport ?? this.viewport,
      headers: {
        ...this.headers,
        ...(options.headers ?? {}),
      },
    });
  }
}

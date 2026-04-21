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
export declare class ConfiguredBrowserGateway implements BrowserGateway {
    private readonly base;
    private readonly userAgent;
    private readonly viewport;
    private readonly headers;
    constructor(options: ConfiguredBrowserGatewayOptions);
    createSession(options?: BrowserSessionOptions): Promise<BrowserSession>;
}

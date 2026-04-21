import { chromium } from 'playwright';
import type { BrowserGateway, BrowserSession, BrowserSessionOptions } from './browser.js';
export type PlaywrightBrowserGatewayOptions = {
    launchOptions?: Parameters<typeof chromium.launch>[0];
};
export declare class PlaywrightBrowserGateway implements BrowserGateway {
    private readonly launchOptions;
    constructor(options?: PlaywrightBrowserGatewayOptions);
    createSession(options?: BrowserSessionOptions): Promise<BrowserSession>;
}

export type BrowserHeaders = Record<string, string>;
export type BrowserSessionOptions = {
    userAgent?: string;
    viewport?: {
        width: number;
        height: number;
    };
    headers?: BrowserHeaders;
};
export type BrowserPageSnapshot = {
    url: string;
    title: string;
    text: string;
};
export type BrowserScreenshot = {
    mimeType: string;
    bytes: Uint8Array;
};
export interface BrowserSession {
    readonly id: string;
    navigate(url: string): Promise<void>;
    click(target: string): Promise<void>;
    type(target: string, text: string): Promise<void>;
    snapshot(): Promise<BrowserPageSnapshot>;
    screenshot(): Promise<BrowserScreenshot>;
    close(): Promise<void>;
}
export interface BrowserGateway {
    createSession(options?: BrowserSessionOptions): Promise<BrowserSession>;
}

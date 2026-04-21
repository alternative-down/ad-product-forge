import type { BrowserGateway, BrowserPageSnapshot, BrowserSession, BrowserSessionOptions } from './browser.js';
export type BrowserSessionEvent = {
    sessionId: string;
    type: 'navigate';
    url: string;
    recordedAt: string;
} | {
    sessionId: string;
    type: 'click';
    target: string;
    recordedAt: string;
} | {
    sessionId: string;
    type: 'type';
    target: string;
    text: string;
    recordedAt: string;
} | {
    sessionId: string;
    type: 'snapshot';
    snapshot: BrowserPageSnapshot;
    recordedAt: string;
} | {
    sessionId: string;
    type: 'screenshot';
    mimeType: string;
    size: number;
    recordedAt: string;
} | {
    sessionId: string;
    type: 'close';
    recordedAt: string;
};
export interface BrowserSessionRecorder {
    record(event: BrowserSessionEvent): Promise<void> | void;
}
export declare class InMemoryBrowserSessionRecorder implements BrowserSessionRecorder {
    private readonly events;
    record(event: BrowserSessionEvent): Promise<void>;
    list(sessionId?: string): BrowserSessionEvent[];
}
export type RecordingBrowserGatewayOptions = {
    base: BrowserGateway;
    recorder: BrowserSessionRecorder;
};
export declare class RecordingBrowserGateway implements BrowserGateway {
    private readonly base;
    private readonly recorder;
    constructor(options: RecordingBrowserGatewayOptions);
    createSession(options?: BrowserSessionOptions): Promise<BrowserSession>;
}

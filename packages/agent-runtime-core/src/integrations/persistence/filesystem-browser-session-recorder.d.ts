import type { BrowserSessionEvent, BrowserSessionRecorder } from '../gateways/browser-recording.js';
export type FilesystemBrowserSessionRecorderOptions = {
    basePath: string;
};
export declare class FilesystemBrowserSessionRecorder implements BrowserSessionRecorder {
    private readonly basePath;
    constructor(options: FilesystemBrowserSessionRecorderOptions);
    record(event: BrowserSessionEvent): Promise<void>;
    list(sessionId: string): Promise<BrowserSessionEvent[]>;
    private writeEvents;
    private getFilePath;
}

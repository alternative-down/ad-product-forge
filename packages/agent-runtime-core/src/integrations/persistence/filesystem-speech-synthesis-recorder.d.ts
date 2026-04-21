import type { SpeechSynthesisEvent, SpeechSynthesisRecorder } from '../gateways/speech-recording.js';
export type FilesystemSpeechSynthesisRecorderOptions = {
    basePath: string;
};
export declare class FilesystemSpeechSynthesisRecorder implements SpeechSynthesisRecorder {
    private readonly basePath;
    constructor(options: FilesystemSpeechSynthesisRecorderOptions);
    record(event: SpeechSynthesisEvent): Promise<void>;
    list(): Promise<SpeechSynthesisEvent[]>;
    private writeEvents;
    private getFilePath;
}

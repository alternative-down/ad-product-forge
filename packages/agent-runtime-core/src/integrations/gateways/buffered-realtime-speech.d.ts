import type { RealtimeSpeechToTextGateway, RealtimeSpeechToTextSession, SpeechToTextGateway } from './speech.js';
export type BufferedRealtimeSpeechToTextGatewayOptions = {
    stt: SpeechToTextGateway;
};
export declare class BufferedRealtimeSpeechToTextGateway implements RealtimeSpeechToTextGateway {
    private readonly stt;
    constructor(options: BufferedRealtimeSpeechToTextGatewayOptions);
    createSession(options?: {
        language?: string;
        headers?: Record<string, string>;
        onTranscription?(event: {
            id: string;
            text: string;
            isFinal: boolean;
            language?: string;
        }): Promise<void> | void;
    }): Promise<RealtimeSpeechToTextSession>;
}

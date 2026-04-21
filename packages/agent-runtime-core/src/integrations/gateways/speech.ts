export type AudioChunk = {
  mimeType: string;
  bytes: Uint8Array;
};

export type TextToSpeechRequest = {
  text: string;
  voiceId?: string;
  headers?: Record<string, string>;
};

export type TextToSpeechResponse = {
  mimeType: string;
  bytes: Uint8Array;
};

export interface TextToSpeechGateway {
  synthesize(request: TextToSpeechRequest): Promise<TextToSpeechResponse>;
}

export type StreamingTextToSpeechResponse = {
  mimeType: string;
  stream: AsyncIterable<AudioChunk>;
};

export interface StreamingTextToSpeechGateway {
  synthesizeStream(request: TextToSpeechRequest): Promise<StreamingTextToSpeechResponse>;
}

export type RealtimeSpeechSynthesisTextEvent = {
  text: string;
  isFinal?: boolean;
};

export type RealtimeSpeechSynthesisAudioEvent = {
  chunk: AudioChunk;
  isFinal?: boolean;
};

export interface RealtimeTextToSpeechSession {
  readonly id: string;
  pushText(event: RealtimeSpeechSynthesisTextEvent): Promise<void>;
  close(): Promise<void>;
}

export interface RealtimeTextToSpeechGateway {
  createSession(options?: {
    voiceId?: string;
    headers?: Record<string, string>;
    onAudioChunk?(event: RealtimeSpeechSynthesisAudioEvent): Promise<void> | void;
  }): Promise<RealtimeTextToSpeechSession>;
}

export type SpeechToTextRequest = {
  audio: AudioChunk;
  language?: string;
  headers?: Record<string, string>;
};

export type SpeechToTextResponse = {
  text: string;
};

export interface SpeechToTextGateway {
  transcribe(request: SpeechToTextRequest): Promise<SpeechToTextResponse>;
}

export interface RealtimeSpeechToTextSession {
  readonly id: string;
  pushAudio(chunk: AudioChunk): Promise<void>;
  close(): Promise<void>;
}

export type RealtimeTranscriptionEvent = {
  id: string;
  text: string;
  isFinal: boolean;
  language?: string;
};

export interface RealtimeSpeechToTextGateway {
  createSession(options?: {
    language?: string;
    headers?: Record<string, string>;
    onTranscription?(event: RealtimeTranscriptionEvent): Promise<void> | void;
  }): Promise<RealtimeSpeechToTextSession>;
}

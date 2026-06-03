import type {
  BrowserGateway,
  BrowserPageSnapshot,
  BrowserScreenshot,
  BrowserSession,
  BrowserSessionOptions,
} from './browser.js';

export type BrowserSessionEvent =
  | { sessionId: string; type: 'navigate'; url: string; recordedAt: string }
  | { sessionId: string; type: 'click'; target: string; recordedAt: string }
  | { sessionId: string; type: 'type'; target: string; text: string; recordedAt: string }
  | { sessionId: string; type: 'snapshot'; snapshot: BrowserPageSnapshot; recordedAt: string }
  | { sessionId: string; type: 'screenshot'; mimeType: string; size: number; recordedAt: string }
  | { sessionId: string; type: 'close'; recordedAt: string };

export interface BrowserSessionRecorder {
  record(event: BrowserSessionEvent): Promise<void> | void;
}

export class InMemoryBrowserSessionRecorder implements BrowserSessionRecorder {
  private readonly events: BrowserSessionEvent[] = [];

  async record(event: BrowserSessionEvent): Promise<void> {
    await Promise.resolve();
    this.events.push(event);
  }

  list(sessionId?: string) {
    return sessionId != null
      ? this.events.filter((event) => event.sessionId === sessionId)
      : [...this.events];
  }
}

export type RecordingBrowserGatewayOptions = {
  base: BrowserGateway;
  recorder: BrowserSessionRecorder;
};

export class RecordingBrowserGateway implements BrowserGateway {
  private readonly base: BrowserGateway;
  private readonly recorder: BrowserSessionRecorder;

  constructor(options: RecordingBrowserGatewayOptions) {
    this.base = options.base;
    this.recorder = options.recorder;
  }

  async createSession(options?: BrowserSessionOptions): Promise<BrowserSession> {
    const session = await this.base.createSession(options);

    return new RecordingBrowserSession({
      session,
      recorder: this.recorder,
    });
  }
}

type RecordingBrowserSessionOptions = {
  session: BrowserSession;
  recorder: BrowserSessionRecorder;
};

class RecordingBrowserSession implements BrowserSession {
  readonly id: string;

  private readonly session: BrowserSession;
  private readonly recorder: BrowserSessionRecorder;

  constructor(options: RecordingBrowserSessionOptions) {
    this.id = options.session.id;
    this.session = options.session;
    this.recorder = options.recorder;
  }

  async navigate(url: string): Promise<void> {
    await this.session.navigate(url);
    await this.recorder.record({
      sessionId: this.id,
      type: 'navigate',
      url,
      recordedAt: new Date().toISOString(),
    });
  }

  async click(target: string): Promise<void> {
    await this.session.click(target);
    await this.recorder.record({
      sessionId: this.id,
      type: 'click',
      target,
      recordedAt: new Date().toISOString(),
    });
  }

  async type(target: string, text: string): Promise<void> {
    await this.session.type(target, text);
    await this.recorder.record({
      sessionId: this.id,
      type: 'type',
      target,
      text,
      recordedAt: new Date().toISOString(),
    });
  }

  async snapshot(): Promise<BrowserPageSnapshot> {
    const snapshot = await this.session.snapshot();
    await this.recorder.record({
      sessionId: this.id,
      type: 'snapshot',
      snapshot,
      recordedAt: new Date().toISOString(),
    });
    return snapshot;
  }

  async screenshot(): Promise<BrowserScreenshot> {
    const screenshot = await this.session.screenshot();
    await this.recorder.record({
      sessionId: this.id,
      type: 'screenshot',
      mimeType: screenshot.mimeType,
      size: screenshot.bytes.length,
      recordedAt: new Date().toISOString(),
    });
    return screenshot;
  }

  async close(): Promise<void> {
    await this.session.close();
    await this.recorder.record({
      sessionId: this.id,
      type: 'close',
      recordedAt: new Date().toISOString(),
    });
  }
}

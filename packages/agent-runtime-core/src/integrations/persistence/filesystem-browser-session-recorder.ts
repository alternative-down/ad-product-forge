import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type { BrowserSessionEvent, BrowserSessionRecorder } from '../gateways/browser-recording.js';

export type FilesystemBrowserSessionRecorderOptions = {
  basePath: string;
};

const browserSessionEventSchema = z.discriminatedUnion('type', [
  z.object({
    sessionId: z.string().min(1),
    type: z.literal('navigate'),
    url: z.string().min(1),
    recordedAt: z.string().min(1),
  }),
  z.object({
    sessionId: z.string().min(1),
    type: z.literal('click'),
    target: z.string().min(1),
    recordedAt: z.string().min(1),
  }),
  z.object({
    sessionId: z.string().min(1),
    type: z.literal('type'),
    target: z.string().min(1),
    text: z.string(),
    recordedAt: z.string().min(1),
  }),
  z.object({
    sessionId: z.string().min(1),
    type: z.literal('snapshot'),
    snapshot: z.object({
      url: z.string().min(1),
      title: z.string(),
      text: z.string(),
    }),
    recordedAt: z.string().min(1),
  }),
  z.object({
    sessionId: z.string().min(1),
    type: z.literal('screenshot'),
    mimeType: z.string().min(1),
    size: z.number().int().nonnegative(),
    recordedAt: z.string().min(1),
  }),
  z.object({
    sessionId: z.string().min(1),
    type: z.literal('close'),
    recordedAt: z.string().min(1),
  }),
]);

export class FilesystemBrowserSessionRecorder implements BrowserSessionRecorder {
  private readonly basePath: string;

  constructor(options: FilesystemBrowserSessionRecorderOptions) {
    this.basePath = options.basePath;
  }

  async record(event: BrowserSessionEvent): Promise<void> {
    const normalizedEvent = browserSessionEventSchema.parse(event);
    const events = await this.list(normalizedEvent.sessionId);
    events.push(normalizedEvent);
    await this.writeEvents(normalizedEvent.sessionId, events);
  }

  async list(sessionId: string): Promise<BrowserSessionEvent[]> {
    try {
      const raw = await readFile(this.getFilePath(sessionId), 'utf8');
      return z.array(browserSessionEventSchema).parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async writeEvents(sessionId: string, events: BrowserSessionEvent[]) {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(sessionId), JSON.stringify(events, null, 2), 'utf8');
  }

  private getFilePath(sessionId: string) {
    return join(this.basePath, `${sessionId}.browser-session.json`);
  }
}

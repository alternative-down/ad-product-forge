import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type {
  SpeechSynthesisEvent,
  SpeechSynthesisRecorder,
} from '../gateways/speech-recording.js';

export type FilesystemSpeechSynthesisRecorderOptions = {
  basePath: string;
};

const speechSynthesisEventSchema = z.object({
  text: z.string(),
  voiceId: z.string().optional(),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
  recordedAt: z.string().min(1),
});

export class FilesystemSpeechSynthesisRecorder implements SpeechSynthesisRecorder {
  private readonly basePath: string;

  constructor(options: FilesystemSpeechSynthesisRecorderOptions) {
    this.basePath = options.basePath;
  }

  async record(event: SpeechSynthesisEvent): Promise<void> {
    const events = await this.list();
    events.push(speechSynthesisEventSchema.parse(event));
    await this.writeEvents(events);
  }

  async list(): Promise<SpeechSynthesisEvent[]> {
    try {
      const raw = await readFile(this.getFilePath(), 'utf8');
      return z.array(speechSynthesisEventSchema).parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async writeEvents(events: SpeechSynthesisEvent[]) {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(), JSON.stringify(events, null, 2), 'utf8');
  }

  private getFilePath() {
    return join(this.basePath, 'speech-synthesis-events.json');
  }
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type {
  WorkspaceCommandEvent,
  WorkspaceCommandRecorder,
} from '../gateways/workspace-recording.js';

export type FilesystemWorkspaceCommandRecorderOptions = {
  basePath: string;
};

const workspaceCommandEventSchema = z.object({
  command: z.string().min(1),
  cwd: z.string().optional(),
  exitCode: z.number().int(),
  stdout: z.string(),
  stderr: z.string(),
  durationMs: z.number().int().nonnegative(),
  recordedAt: z.string().min(1),
});

export class FilesystemWorkspaceCommandRecorder implements WorkspaceCommandRecorder {
  private readonly basePath: string;

  constructor(options: FilesystemWorkspaceCommandRecorderOptions) {
    this.basePath = options.basePath;
  }

  async record(event: WorkspaceCommandEvent): Promise<void> {
    const events = await this.list();
    events.push(workspaceCommandEventSchema.parse(event));
    await this.writeEvents(events);
  }

  async list(): Promise<WorkspaceCommandEvent[]> {
    try {
      const raw = await readFile(this.getFilePath(), 'utf8');
      return z.array(workspaceCommandEventSchema).parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  private async writeEvents(events: WorkspaceCommandEvent[]) {
    await mkdir(this.basePath, { recursive: true });
    await writeFile(this.getFilePath(), JSON.stringify(events, null, 2), 'utf8');
  }

  private getFilePath() {
    return join(this.basePath, 'workspace-command-events.json');
  }
}

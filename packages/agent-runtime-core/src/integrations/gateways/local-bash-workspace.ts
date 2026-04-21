import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type {
  WorkspaceCommandRequest,
  WorkspaceCommandResult,
  WorkspaceGateway,
} from './workspace.js';

const execFileAsync = promisify(execFile);

export class LocalBashWorkspaceGateway implements WorkspaceGateway {
  async execute(request: WorkspaceCommandRequest): Promise<WorkspaceCommandResult> {
    try {
      const result = await execFileAsync('bash', ['-lc', request.command], {
        cwd: request.cwd,
        env: request.env,
        timeout: request.timeoutMs,
        maxBuffer: 1024 * 1024,
      });

      return {
        exitCode: 0,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      const failed = error as {
        code?: number | string;
        stdout?: string;
        stderr?: string;
      };

      return {
        exitCode: typeof failed.code === 'number' ? failed.code : 1,
        stdout: failed.stdout ?? '',
        stderr: failed.stderr ?? '',
      };
    }
  }
}

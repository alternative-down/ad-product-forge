import fs from 'node:fs/promises';
import path from 'node:path';

export type LocalWorkspaceFilesystemOptions = {
  root: string;
  contained?: boolean;
  readOnly?: boolean;
  allowedPaths?: string[];
};

export class LocalWorkspaceFilesystem {
  private readonly root: string;
  private readonly contained: boolean;
  private readonly readOnly: boolean;
  private readonly allowedPaths: string[];

  constructor(options: LocalWorkspaceFilesystemOptions) {
    this.root = path.resolve(options.root);
    this.contained = options.contained ?? true;
    this.readOnly = options.readOnly ?? false;
    this.allowedPaths = (options.allowedPaths ?? []).map((allowedPath) =>
      path.resolve(allowedPath),
    );
  }

  async exists(targetPath: string) {
    try {
      await fs.stat(await this.resolveContainedPath(targetPath, false));
      return true;
    } catch {
      return false;
    }
  }

  async readFile(targetPath: string) {
    return fs.readFile(await this.resolveContainedPath(targetPath, false));
  }

  async writeFile(targetPath: string, data: Uint8Array | Buffer | string) {
    if (this.readOnly) {
      throw new Error('Workspace filesystem is read-only');
    }

    const absolutePath = await this.resolveContainedPath(targetPath, true);

    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, data);
  }

  async listDirectory(targetPath = '.') {
    const absolutePath = await this.resolveContainedPath(targetPath, false);
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    return Promise.all(
      entries.map(async (entry) => {
        const entryAbsolutePath = path.join(absolutePath, entry.name);
        const stats = await fs.stat(entryAbsolutePath);

        // Return paths relative to the workspace root to prevent exposing
        // absolute host paths to agents
        const relativePath = path.relative(this.root, entryAbsolutePath);
        return {
          name: entry.name,
          path: relativePath === '' ? '.' : relativePath,
          isDirectory: entry.isDirectory(),
          size: stats.size,
        };
      }),
    );
  }

  resolveAbsolutePath(targetPath: string) {
    return this.resolvePath(targetPath);
  }

  private resolvePath(targetPath: string) {
    const absolutePath = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.root, targetPath);

    if (!this.contained) {
      return absolutePath;
    }

    if (isWithinAnyRoot(absolutePath, [this.root, ...this.allowedPaths])) {
      return absolutePath;
    }

    throw new Error(`Workspace path must stay within allowed roots: ${targetPath}`);
  }

  private async resolveContainedPath(targetPath: string, forWrite: boolean) {
    const absolutePath = this.resolvePath(targetPath);
    const checkPath = forWrite ? path.dirname(absolutePath) : absolutePath;
    const realPath = await resolveExistingRealPath(checkPath);

    if (
      realPath != null &&
      this.contained &&
      !isWithinAnyRoot(realPath, [this.root, ...this.allowedPaths])
    ) {
      throw new Error(`Workspace path escapes allowed roots: ${targetPath}`);
    }

    return absolutePath;
  }
}

function isWithinAnyRoot(targetPath: string, roots: string[]) {
  return roots.some((root) => {
    const relativePath = path.relative(root, targetPath);

    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  });
}

async function resolveExistingRealPath(targetPath: string): Promise<string | null> {
  let currentPath = targetPath;

  while (true) {
    try {
      return await fs.realpath(currentPath);
    } catch {
      const parentPath = path.dirname(currentPath);

      if (parentPath === currentPath) {
        return null;
      }

      currentPath = parentPath;
    }
  }
}

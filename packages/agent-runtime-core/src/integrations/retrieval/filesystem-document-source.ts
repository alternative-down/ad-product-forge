import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { RetrievalDocumentSource, RetrievalSourceDocument } from './contracts.js';

export type FilesystemDocumentSourceOptions = {
  roots: string[];
  includeExtensions?: string[];
};

export class FilesystemDocumentSource implements RetrievalDocumentSource {
  private readonly roots: string[];
  private readonly includeExtensions: Set<string> | null;

  constructor(options: FilesystemDocumentSourceOptions) {
    this.roots = options.roots;
    this.includeExtensions = options.includeExtensions != null && options.includeExtensions.length > 0
      ? new Set(options.includeExtensions.map((value) => value.toLowerCase()))
      : null;
  }

  async loadDocuments(): Promise<RetrievalSourceDocument[]> {
    const filePaths = await Promise.all(this.roots.map((root) => listFiles(root)));
    const documents = await Promise.all(
      filePaths.flat().map(async (filePath): Promise<RetrievalSourceDocument | null> => {
        if (
          this.includeExtensions &&
          !this.includeExtensions.has(path.extname(filePath).toLowerCase())
        ) {
          return null;
        }

        const text = await readFile(filePath, 'utf8').catch(() => null);

        if (text == null || text.trim().length === 0) {
          return null;
        }

        return {
          id: filePath,
          text,
          metadata: {
            path: filePath,
          },
        } satisfies RetrievalSourceDocument;
      }),
    );

    return documents.filter((document): document is RetrievalSourceDocument => document !== null);
  }
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, {
    withFileTypes: true,
  }).catch(() => []);
  const nestedPaths = await Promise.all(
    entries.map(async (entry) => {
      const currentPath = path.join(root, entry.name);

      if (entry.isDirectory()) {
        return await listFiles(currentPath);
      }

      if (!entry.isFile()) {
        return [];
      }

      return [currentPath];
    }),
  );

  return nestedPaths.flat();
}

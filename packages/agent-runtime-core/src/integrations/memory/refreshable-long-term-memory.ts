import type { RetrievedDocument } from '../retrieval/contracts.js';
import {
  RetrievalRefreshController,
  type RetrievalRefreshSnapshot,
} from '../retrieval/refresh-controller.js';

import type {
  LongTermMemoryDocument,
  LongTermMemoryRecall,
  LongTermMemoryRecallRequest,
  LongTermMemoryStore,
} from './long-term-memory.js';

export interface RefreshableRecallWorkspace {
  refresh(): Promise<void>;
  search(query: string, options?: { topK?: number }): Promise<RetrievedDocument[]>;
}

export class RefreshableLongTermMemoryRecall implements LongTermMemoryRecall {
  private readonly workspace: RefreshableRecallWorkspace;
  private readonly refreshController: RetrievalRefreshController;

  constructor(options: {
    workspace: RefreshableRecallWorkspace;
    refreshController?: RetrievalRefreshController;
  }) {
    this.workspace = options.workspace;
    this.refreshController = options.refreshController ?? new RetrievalRefreshController();
  }

  markDirty(reason?: string) {
    this.refreshController.markDirty(reason);
  }

  async refresh() {
    await this.refreshController.refresh(() => this.workspace.refresh());
  }

  getRefreshSnapshot(): RetrievalRefreshSnapshot {
    return this.refreshController.getSnapshot();
  }

  async recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]> {
    await this.refreshController.refreshIfDirty(() => this.workspace.refresh());

    const results = await this.workspace.search(request.query, {
      topK: request.topK,
    });
    const threshold = request.threshold ?? 0;

    return results.filter((result) => result.score >= threshold);
  }
}

export class SourceBackedLongTermMemory implements LongTermMemoryStore, LongTermMemoryRecall {
  private readonly store: LongTermMemoryStore;
  private readonly recallEngine: RefreshableLongTermMemoryRecall;

  constructor(options: { store: LongTermMemoryStore; recall: RefreshableLongTermMemoryRecall }) {
    this.store = options.store;
    this.recallEngine = options.recall;
  }

  async write(document: LongTermMemoryDocument): Promise<void> {
    await this.store.write(document);
    this.recallEngine.markDirty(`write:${document.id}`);
  }

  async remove(documentId: string): Promise<void> {
    await this.store.remove(documentId);
    this.recallEngine.markDirty(`remove:${documentId}`);
  }

  async list(): Promise<LongTermMemoryDocument[]> {
    return this.store.list();
  }

  async recall(request: LongTermMemoryRecallRequest): Promise<RetrievedDocument[]> {
    return this.recallEngine.recall(request);
  }

  async refresh() {
    await this.recallEngine.refresh();
  }

  getRefreshSnapshot() {
    return this.recallEngine.getRefreshSnapshot();
  }
}

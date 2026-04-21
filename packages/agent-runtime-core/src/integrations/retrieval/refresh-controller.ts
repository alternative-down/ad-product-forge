export type RetrievalRefreshSnapshot = {
  dirty: boolean;
  refreshCount: number;
  lastRefreshAt: string | null;
  lastDirtyReason: string | null;
};

export class RetrievalRefreshController {
  private dirty = true;
  private refreshCount = 0;
  private lastRefreshAt: string | null = null;
  private lastDirtyReason: string | null = 'initial';

  markDirty(reason: string = 'manual') {
    this.dirty = true;
    this.lastDirtyReason = reason;
  }

  async refresh(refresher: () => Promise<void>) {
    await refresher();
    this.dirty = false;
    this.refreshCount += 1;
    this.lastRefreshAt = new Date().toISOString();
    this.lastDirtyReason = null;
  }

  async refreshIfDirty(refresher: () => Promise<void>) {
    if (!this.dirty) {
      return false;
    }

    await this.refresh(refresher);
    return true;
  }

  getSnapshot(): RetrievalRefreshSnapshot {
    return {
      dirty: this.dirty,
      refreshCount: this.refreshCount,
      lastRefreshAt: this.lastRefreshAt,
      lastDirtyReason: this.lastDirtyReason,
    };
  }
}

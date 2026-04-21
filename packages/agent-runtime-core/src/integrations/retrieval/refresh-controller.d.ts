export type RetrievalRefreshSnapshot = {
    dirty: boolean;
    refreshCount: number;
    lastRefreshAt: string | null;
    lastDirtyReason: string | null;
};
export declare class RetrievalRefreshController {
    private dirty;
    private refreshCount;
    private lastRefreshAt;
    private lastDirtyReason;
    markDirty(reason?: string): void;
    refresh(refresher: () => Promise<void>): Promise<void>;
    refreshIfDirty(refresher: () => Promise<void>): Promise<boolean>;
    getSnapshot(): RetrievalRefreshSnapshot;
}

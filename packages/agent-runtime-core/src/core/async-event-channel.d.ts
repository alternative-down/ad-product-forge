export type AsyncEventListener<TEvent> = (event: TEvent) => Promise<void> | void;
export declare class AsyncEventChannel<TEvent> implements AsyncIterable<TEvent> {
    private readonly queue;
    private readonly listeners;
    private readonly waiters;
    private closed;
    publish(event: TEvent): void;
    subscribe(listener: AsyncEventListener<TEvent>): () => void;
    next(options?: {
        timeoutMs?: number;
    }): Promise<TEvent | null>;
    drain(): TEvent[];
    close(): void;
    [Symbol.asyncIterator](): AsyncIterator<TEvent>;
}

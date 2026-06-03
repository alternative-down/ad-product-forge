export type AsyncEventListener<TEvent> = (event: TEvent) => Promise<void> | void;

export class AsyncEventChannel<TEvent> implements AsyncIterable<TEvent> {
  private readonly queue: TEvent[] = [];
  private readonly listeners = new Set<AsyncEventListener<TEvent>>();
  private readonly waiters = new Set<(event: TEvent | null) => void>();
  private closed = false;

  publish(event: TEvent) {
    if (this.closed) {
      return;
    }

    const waiter = this.waiters.values().next().value as
      | ((event: TEvent | null) => void)
      | undefined;

    if (waiter) {
      this.waiters.delete(waiter);
      waiter(event);
    } else {
      this.queue.push(event);
    }

    for (const listener of this.listeners) {
      void listener(event);
    }
  }

  subscribe(listener: AsyncEventListener<TEvent>) {
    this.listeners.add(listener);

    return () => {
      this.listeners.delete(listener);
    };
  }

  async next(options: { timeoutMs?: number } = {}) {
    if (this.queue.length > 0) {
      return this.queue.shift() ?? null;
    }

    if (this.closed) {
      return null;
    }

    return new Promise<TEvent | null>((resolve) => {
      const waiter = (event: TEvent | null) => {
        if (timeout) {
          clearTimeout(timeout);
        }

        resolve(event);
      };
      const timeout = options.timeoutMs != null
        ? setTimeout(() => {
            this.waiters.delete(waiter);
            resolve(null);
          }, options.timeoutMs)
        : null;

      this.waiters.add(waiter);
    });
  }

  drain() {
    const events = [...this.queue];

    this.queue.splice(0, this.queue.length);

    return events;
  }

  close() {
    this.closed = true;

    for (const waiter of this.waiters) {
      waiter(null);
    }

    this.waiters.clear();
    this.listeners.clear();
  }

  [Symbol.asyncIterator](): AsyncIterator<TEvent> {
    return {
      next: async () => {
        const event = await this.next();

        if (!event) {
          return {
            done: true,
            value: undefined,
          };
        }

        return {
          done: false,
          value: event,
        };
      },
    };
  }
}

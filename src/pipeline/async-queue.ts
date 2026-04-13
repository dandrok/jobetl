interface PendingEnqueue<T> {
  item: T;
  resolve(): void;
  reject(error: Error): void;
}

export class AsyncQueue<T> {
  private readonly items: T[] = [];
  private readonly pendingDequeues: Array<(item: T | undefined) => void> = [];
  private readonly pendingEnqueues: Array<PendingEnqueue<T>> = [];
  private closed = false;

  constructor(private readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error("AsyncQueue capacity must be a positive integer");
    }
  }

  async enqueue(item: T): Promise<void> {
    if (this.closed) {
      throw new Error("Cannot enqueue into a closed AsyncQueue");
    }

    const pendingDequeue = this.pendingDequeues.shift();
    if (pendingDequeue) {
      pendingDequeue(item);
      return;
    }

    if (this.items.length < this.capacity) {
      this.items.push(item);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.pendingEnqueues.push({ item, resolve, reject });
    });
  }

  async dequeue(): Promise<T | undefined> {
    const item = this.items.shift();
    if (item !== undefined) {
      this.flushPendingEnqueues();
      return item;
    }

    const pendingEnqueue = this.pendingEnqueues.shift();
    if (pendingEnqueue) {
      pendingEnqueue.resolve();
      return pendingEnqueue.item;
    }

    if (this.closed) {
      return undefined;
    }

    return new Promise<T | undefined>((resolve) => {
      this.pendingDequeues.push(resolve);
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.flushPendingEnqueues();

    if (this.items.length === 0 && this.pendingEnqueues.length === 0) {
      this.flushPendingDequeues();
    }
  }

  private flushPendingEnqueues(): void {
    while (this.pendingEnqueues.length > 0) {
      const pendingDequeue = this.pendingDequeues.shift();
      if (pendingDequeue) {
        const pendingEnqueue = this.pendingEnqueues.shift();
        if (!pendingEnqueue) {
          return;
        }

        pendingEnqueue.resolve();
        pendingDequeue(pendingEnqueue.item);
        continue;
      }

      if (this.closed) {
        const pendingEnqueue = this.pendingEnqueues.shift();
        if (!pendingEnqueue) {
          return;
        }

        pendingEnqueue.reject(new Error("Cannot enqueue into a closed AsyncQueue"));
        continue;
      }

      if (this.items.length >= this.capacity) {
        return;
      }

      const pendingEnqueue = this.pendingEnqueues.shift();
      if (!pendingEnqueue) {
        return;
      }

      this.items.push(pendingEnqueue.item);
      pendingEnqueue.resolve();
    }

    if (this.closed && this.items.length === 0) {
      this.flushPendingDequeues();
    }
  }

  private flushPendingDequeues(): void {
    while (this.pendingDequeues.length > 0) {
      const pendingDequeue = this.pendingDequeues.shift();
      pendingDequeue?.(undefined);
    }
  }
}

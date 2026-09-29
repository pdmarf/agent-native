export interface QueuedWrites {
  seq: number;
  tail: Promise<unknown>;
  cancelledThrough: number;
  /** Saves that failed, not counting those cancelled behind one. */
  failures: number;
}

export function newQueuedWrites(): QueuedWrites {
  return {
    seq: 0,
    tail: Promise.resolve(),
    cancelledThrough: 0,
    failures: 0,
  };
}

// A save queued behind one that failed was built on a screen already showing
// the failed change, so sending it would save that change after all.
export class WriteCancelled extends Error {
  constructor() {
    super("An earlier save failed, so this one was not sent.");
    this.name = "WriteCancelled";
  }
}

export function queueWrite(
  writes: QueuedWrites,
  task: () => Promise<void>,
): { seq: number; done: Promise<void> } {
  const seq = ++writes.seq;
  const done = writes.tail
    .then(() => {
      if (seq <= writes.cancelledThrough) throw new WriteCancelled();
      return task();
    })
    .catch((err: unknown) => {
      if (!(err instanceof WriteCancelled)) {
        writes.cancelledThrough = writes.seq;
        writes.failures += 1;
      }
      throw err;
    });
  writes.tail = done.catch(() => undefined);
  return { seq, done };
}

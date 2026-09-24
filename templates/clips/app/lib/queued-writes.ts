/** A run of saves to one list: how many have been started, and the last one. */
export interface QueuedWrites {
  seq: number;
  tail: Promise<unknown>;
}

/**
 * Run `task` once every save queued before it has finished, so they reach the
 * server in the order they were made. A failed save does not hold up the next.
 */
export function queueWrite(
  writes: QueuedWrites,
  task: () => Promise<void>,
): Promise<void> {
  const run = writes.tail.then(task);
  writes.tail = run.catch(() => undefined);
  return run;
}

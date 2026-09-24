import { describe, expect, it } from "vitest";

import { queueWrite, type QueuedWrites } from "./queued-writes";

const fresh = (): QueuedWrites => ({ seq: 0, tail: Promise.resolve() });

describe("queued saves", () => {
  it("starts a save only once the one before it has finished", async () => {
    const writes = fresh();
    const order: string[] = [];
    let finishFirst!: () => void;
    const first = queueWrite(writes, async () => {
      order.push("first started");
      await new Promise<void>((resolve) => (finishFirst = resolve));
      order.push("first done");
    });
    const second = queueWrite(writes, async () => {
      order.push("second started");
    });

    await Promise.resolve();
    expect(order).toEqual(["first started"]);
    finishFirst();
    await Promise.all([first, second]);
    expect(order).toEqual(["first started", "first done", "second started"]);
  });

  it("still runs the next save when one fails, and reports the failure", async () => {
    const writes = fresh();
    const failed = queueWrite(writes, async () => {
      throw new Error("offline");
    });
    let ran = false;
    const next = queueWrite(writes, async () => {
      ran = true;
    });
    await expect(failed).rejects.toThrow("offline");
    await next;
    expect(ran).toBe(true);
  });
});

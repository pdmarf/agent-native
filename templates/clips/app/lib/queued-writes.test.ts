import { describe, expect, it } from "vitest";

import { newQueuedWrites, queueWrite, WriteCancelled } from "./queued-writes";

describe("queued saves", () => {
  it("starts a save only once the one before it has finished", async () => {
    const writes = newQueuedWrites();
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
    await Promise.all([first.done, second.done]);
    expect(order).toEqual(["first started", "first done", "second started"]);
  });

  it("numbers each save, so a caller can tell whether it is still the latest", () => {
    const writes = newQueuedWrites();
    const a = queueWrite(writes, async () => {});
    const b = queueWrite(writes, async () => {});
    expect([a.seq, b.seq, writes.seq]).toEqual([1, 2, 2]);
  });

  it("abandons the saves queued behind one that fails", async () => {
    const writes = newQueuedWrites();
    let ran = false;
    const failed = queueWrite(writes, async () => {
      throw new Error("offline");
    });
    const behind = queueWrite(writes, async () => {
      ran = true;
    });
    await expect(failed.done).rejects.toThrow("offline");
    await expect(behind.done).rejects.toBeInstanceOf(WriteCancelled);
    // It was built on top of the failed change, so sending it would have
    // saved that change after all.
    expect(ran).toBe(false);
  });

  it("runs a save made after the failure as normal", async () => {
    const writes = newQueuedWrites();
    const failed = queueWrite(writes, async () => {
      throw new Error("offline");
    });
    await expect(failed.done).rejects.toThrow("offline");
    let ran = false;
    await queueWrite(writes, async () => {
      ran = true;
    }).done;
    expect(ran).toBe(true);
  });

  it("counts a failed save, but not the ones cancelled behind it", async () => {
    const writes = newQueuedWrites();
    const failed = queueWrite(writes, async () => {
      throw new Error("offline");
    });
    const behind = queueWrite(writes, async () => {});
    await expect(failed.done).rejects.toThrow("offline");
    await expect(behind.done).rejects.toBeInstanceOf(WriteCancelled);
    expect(writes.failures).toBe(1);
  });
});

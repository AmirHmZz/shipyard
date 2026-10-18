import { afterEach, describe, expect, it, vi } from "vitest";
import { LogBuffer } from "./log-buffer";
afterEach(() => vi.useRealTimers());
describe("log publication boundary", () => {
  it("batches bursts while keeping pending text available to copy", () => {
    vi.useFakeTimers();
    const publish = vi.fn(),
      buffer = new LogBuffer(publish);
    for (let i = 0; i < 100; i++) buffer.push(String(i));
    expect(publish).not.toHaveBeenCalled();
    expect(buffer.snapshot()).toHaveLength(100);
    vi.advanceTimersByTime(50);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].at(-1)).toEqual({
      number: 100,
      text: "99",
    });
  });
  it("retains ordered recent lines across multiple ring wraps", () => {
    vi.useFakeTimers();
    const buffer = new LogBuffer(vi.fn(), 3);
    for (let i = 1; i <= 8; i++) buffer.push(String(i));
    expect(buffer.snapshot()).toEqual(
      [6, 7, 8].map((number) => ({ number, text: String(number) })),
    );
    buffer.dispose();
  });
  it("cancels pending publication when a stream closes", () => {
    vi.useFakeTimers();
    const publish = vi.fn(),
      buffer = new LogBuffer(publish);
    buffer.push("late");
    buffer.dispose();
    vi.runAllTimers();
    expect(publish).not.toHaveBeenCalled();
  });
});

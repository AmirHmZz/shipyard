export type LogLine = { number: number; text: string };

/** Constant-time append; publish a bounded snapshot once per batch. */
export class LogBuffer {
  private lines: LogLine[] = [];
  private sequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private publish: (lines: LogLine[]) => void,
    private capacity = 2000,
  ) {}
  push(text: string) {
    this.lines[this.sequence++ % this.capacity] = {
      number: this.sequence,
      text,
    };
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.publish(this.snapshot());
    }, 50);
  }
  snapshot(): LogLine[] {
    const start =
      this.sequence >= this.capacity ? this.sequence % this.capacity : 0;
    return [...this.lines.slice(start), ...this.lines.slice(0, start)];
  }
  dispose() {
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

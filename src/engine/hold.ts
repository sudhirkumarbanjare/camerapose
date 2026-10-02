/**
 * Fires once the pose has been held continuously for `holdMs`. Brief drop-outs
 * shorter than `graceMs` (a noisy frame) don't reset the timer.
 */
export class HoldTracker {
  private since: number | null = null;
  private lastGood = 0;

  constructor(
    private holdMs = 1200,
    private readonly graceMs = 300,
  ) {}

  setHoldMs(ms: number) {
    this.holdMs = ms;
  }

  /** Returns progress 0..1; 1 means the hold is complete. */
  push(matched: boolean, now: number): number {
    if (matched) {
      if (this.since === null) this.since = now;
      this.lastGood = now;
    } else if (this.since !== null && now - this.lastGood > this.graceMs) {
      this.since = null;
    }
    if (this.since === null) return 0;
    return Math.min(1, (now - this.since) / this.holdMs);
  }

  reset() {
    this.since = null;
  }
}

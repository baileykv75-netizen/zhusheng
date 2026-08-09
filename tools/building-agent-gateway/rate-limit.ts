export class MemoryRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly maximum: number;
  private readonly windowMs: number;

  constructor(maximum = 20, windowMs = 60_000) { this.maximum = maximum; this.windowMs = windowMs; }

  accept(key: string, now = Date.now()) {
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => now - timestamp < this.windowMs);
    if (recent.length >= this.maximum) return false;
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

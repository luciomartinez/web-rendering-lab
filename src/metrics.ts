export interface FpsStats {
  fps: number;
}

export class FpsMeter {
  private lastTickTime = 0;
  private sampleStartedAt = 0;
  private framesInSample = 0;
  private stats: FpsStats = {
    fps: 0
  };

  reset(now = performance.now()): void {
    this.lastTickTime = now;
    this.sampleStartedAt = now;
    this.framesInSample = 0;
    this.stats = {
      fps: 0
    };
  }

  record(now: number): FpsStats | null {
    if (this.lastTickTime === 0) {
      this.reset(now);
      return null;
    }

    this.lastTickTime = now;
    this.framesInSample += 1;

    const sampleMs = now - this.sampleStartedAt;
    if (sampleMs < 350) {
      return null;
    }

    this.stats = {
      fps: Math.round((this.framesInSample / sampleMs) * 1000)
    };
    this.sampleStartedAt = now;
    this.framesInSample = 0;

    return this.stats;
  }

  get current(): FpsStats {
    return this.stats;
  }
}

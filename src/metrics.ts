export interface FrameStats {
  fps: number;
  averageFrameMs: number;
  lastFrameMs: number;
}

export class FrameMeter {
  private lastFrameTime = 0;
  private sampleStartedAt = 0;
  private framesInSample = 0;
  private frameMsTotal = 0;
  private stats: FrameStats = {
    fps: 0,
    averageFrameMs: 0,
    lastFrameMs: 0
  };

  reset(now = performance.now()): void {
    this.lastFrameTime = now;
    this.sampleStartedAt = now;
    this.framesInSample = 0;
    this.frameMsTotal = 0;
    this.stats = {
      fps: 0,
      averageFrameMs: 0,
      lastFrameMs: 0
    };
  }

  record(now: number): FrameStats | null {
    if (this.lastFrameTime === 0) {
      this.reset(now);
      return null;
    }

    const lastFrameMs = now - this.lastFrameTime;
    this.lastFrameTime = now;
    this.framesInSample += 1;
    this.frameMsTotal += lastFrameMs;

    const sampleMs = now - this.sampleStartedAt;
    if (sampleMs < 350) {
      return null;
    }

    this.stats = {
      fps: Math.round((this.framesInSample / sampleMs) * 1000),
      averageFrameMs: this.frameMsTotal / this.framesInSample,
      lastFrameMs
    };
    this.sampleStartedAt = now;
    this.framesInSample = 0;
    this.frameMsTotal = 0;

    return this.stats;
  }

  get current(): FrameStats {
    return this.stats;
  }
}

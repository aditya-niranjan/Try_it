/**
 * OneEuroFilter — Casiez et al. 2012 noise filter for real-time signal smoothing.
 *
 * The One Euro filter adapts its cutoff frequency based on the speed of the input signal:
 * - When the signal is slow (nearly still), it uses a low cutoff → more smoothing, less jitter.
 * - When the signal moves fast, it raises the cutoff → less smoothing, less lag.
 *
 * Parameters:
 *   - minCutoff: minimum cutoff frequency (lower = more smoothing when still)
 *   - beta: speed coefficient (higher = less lag during fast movement)
 *   - dCutoff: cutoff for the derivative filter
 */

/**
 * Simple low-pass filter used internally by the One Euro filter.
 */
class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s;
    }
    this.y = value;
    return this.s;
  }

  lastValue(): number {
    return this.s ?? 0;
  }

  reset(): void {
    this.y = null;
    this.s = null;
  }
}

/**
 * One Euro Filter for a single scalar value.
 */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private xFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private lastTimestamp: number | null = null;
  private freq: number;

  constructor(
    freq: number = 120,
    minCutoff: number = 1.0,
    beta: number = 0.007,
    dCutoff: number = 1.0
  ) {
    this.freq = freq;
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.xFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
  }

  private alpha(cutoff: number): number {
    const te = 1.0 / this.freq;
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / te);
  }

  filter(value: number, timestamp: number): number {
    if (this.lastTimestamp !== null && timestamp > this.lastTimestamp) {
      this.freq = 1000.0 / (timestamp - this.lastTimestamp);
    }
    this.lastTimestamp = timestamp;

    // Estimate the derivative of the signal
    const prevValue = this.xFilter.lastValue();
    const dx =
      this.lastTimestamp === null || this.freq === 0
        ? 0
        : (value - prevValue) * this.freq;

    // Filter the derivative
    const edx = this.dxFilter.filter(dx, this.alpha(this.dCutoff));

    // Adapt the cutoff based on the filtered derivative (speed)
    const cutoff = this.minCutoff + this.beta * Math.abs(edx);

    // Filter the value
    return this.xFilter.filter(value, this.alpha(cutoff));
  }

  reset(): void {
    this.xFilter.reset();
    this.dxFilter.reset();
    this.lastTimestamp = null;
  }
}

/**
 * Normalized landmark with x, y, z, visibility.
 */
export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

/**
 * LandmarkSmoother — manages 33 × 3 One Euro filters (x, y, z per landmark).
 * Visibility is not smoothed (it's a confidence score, not a position).
 */
export class LandmarkSmoother {
  private filters: OneEuroFilter[][];
  private readonly numLandmarks: number;

  constructor(
    numLandmarks: number = 33,
    minCutoff: number = 1.5,
    beta: number = 0.01
  ) {
    this.numLandmarks = numLandmarks;
    this.filters = [];
    for (let i = 0; i < numLandmarks; i++) {
      this.filters.push([
        new OneEuroFilter(120, minCutoff, beta), // x
        new OneEuroFilter(120, minCutoff, beta), // y
        new OneEuroFilter(120, minCutoff, beta), // z
      ]);
    }
  }

  /**
   * Smooth a full set of landmarks. Returns a new array of smoothed landmarks.
   */
  smooth(
    landmarks: NormalizedLandmark[],
    timestampMs: number
  ): NormalizedLandmark[] {
    const result: NormalizedLandmark[] = [];
    const count = Math.min(landmarks.length, this.numLandmarks);

    for (let i = 0; i < count; i++) {
      const lm = landmarks[i];
      result.push({
        x: this.filters[i][0].filter(lm.x, timestampMs),
        y: this.filters[i][1].filter(lm.y, timestampMs),
        z: this.filters[i][2].filter(lm.z, timestampMs),
        visibility: lm.visibility,
      });
    }

    return result;
  }

  /**
   * Reset all filters (e.g., when tracking is lost and regained).
   */
  reset(): void {
    for (const group of this.filters) {
      for (const f of group) {
        f.reset();
      }
    }
  }
}

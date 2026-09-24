/**
 * PoseTracker — offloads MediaPipe PoseLandmarker inference to a Web Worker.
 *
 * ARCHITECTURE (60 FPS DECOUPLED):
 * 1. Main thread rAF loop (60 FPS):
 *    - Draws mirrored video frame (~0.5ms)
 *    - Reads tracker.latestResult (0ms)
 *    - Draws skeleton overlay (~0.5ms)
 *    - Calls tracker.sendFrame(video) — non-blocking
 *
 * 2. Web Worker thread (Background, ~25-40 FPS):
 *    - Receives ImageBitmap via zero-copy transfer
 *    - Executes PoseLandmarker.detectForVideo(bitmap, timestamp)
 *    - Closes ImageBitmap
 *    - Returns landmarks via postMessage
 *
 * Result: The main thread is never blocked by inference. Frame budget of 16.6ms
 * is easily maintained, delivering 60 FPS rendering.
 */

import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { LandmarkSmoother, type NormalizedLandmark } from './OneEuroFilter';

export type { PoseLandmarkerResult };

export interface PoseTrackerOptions {
  modelPath?: string;
  numPoses?: number;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
  /** WASM files base path. Defaults to CDN. */
  wasmBasePath?: string;
}

export interface SmoothedPoseResult {
  /** The raw result landmarks from MediaPipe. */
  raw: PoseLandmarkerResult | null;
  /** Smoothed landmarks for the detected pose. */
  smoothedLandmarks: NormalizedLandmark[] | null;
  /** Timestamp when this result was produced. */
  timestampMs: number;
}

const DEFAULT_OPTIONS: Required<PoseTrackerOptions> = {
  modelPath: '/models/pose_landmarker_lite.task',
  numPoses: 1,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  wasmBasePath:
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
};

export class PoseTracker {
  private worker: Worker | null = null;
  private smoother: LandmarkSmoother | null = null;
  private _isReady = false;
  private _isBusy = false;
  private _activeDelegate: 'GPU' | 'CPU' = 'CPU';
  private _lastInferenceDurationMs = 0;
  private lastTimestamp = -1;
  private _lastVideoTime = -1;

  /**
   * The latest pose result. Written by the worker's onmessage handler,
   * read synchronously by the render loop (rAF).
   */
  private _latestResult: SmoothedPoseResult | null = null;

  /** Whether the model is loaded and ready for detection. */
  get isReady(): boolean {
    return this._isReady;
  }

  /** The delegate actively used by PoseLandmarker ('GPU' or 'CPU'). */
  get activeDelegate(): 'GPU' | 'CPU' {
    return this._activeDelegate;
  }

  /** Duration of the last inference call in milliseconds. */
  get lastInferenceDurationMs(): number {
    return this._lastInferenceDurationMs;
  }

  /** Read the latest result (non-blocking, called from rAF loop). */
  get latestResult(): SmoothedPoseResult | null {
    return this._latestResult;
  }

  /**
   * Initialize the Web Worker and PoseLandmarker.
   */
  async init(options?: PoseTrackerOptions): Promise<void> {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    this.smoother = new LandmarkSmoother(33, 1.5, 0.01);

    return new Promise<void>((resolve, reject) => {
      try {
        // Instantiate the dedicated Web Worker
        this.worker = new Worker(
          new URL('./pose.worker.ts', import.meta.url),
          { type: 'module' }
        );

        const handleInitMessage = (event: MessageEvent) => {
          const data = event.data;
          if (data?.type === 'INIT_RESULT') {
            if (this.worker) {
              this.worker.removeEventListener('message', handleInitMessage);
            }

            if (data.success) {
              this._isReady = true;
              this._activeDelegate = data.delegate || 'CPU';
              console.log(
                `[PoseTracker] Worker initialized with ${this._activeDelegate} delegate`
              );
              this.setupWorkerListeners();
              resolve();
            } else {
              reject(
                new Error(data.error || 'Failed to initialize worker model')
              );
            }
          }
        };

        this.worker.addEventListener('message', handleInitMessage);
        this.worker.addEventListener('error', (err) => {
          console.error('[PoseTracker] Worker error during init:', err);
          reject(err);
        });

        // Send INIT request to worker
        this.worker.postMessage({
          type: 'INIT',
          modelPath: opts.modelPath,
          wasmBasePath: opts.wasmBasePath,
          minDetectionConfidence: opts.minDetectionConfidence,
          minTrackingConfidence: opts.minTrackingConfidence,
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Set up message handler for inference results from worker.
   */
  private setupWorkerListeners(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'DETECT_RESULT') {
        this._isBusy = false;
        this._lastInferenceDurationMs = data.durationMs || 0;

        if (data.landmarks && data.landmarks.length > 0) {
          const rawLandmarks = data.landmarks as NormalizedLandmark[];
          const smoothed = this.smoother
            ? this.smoother.smooth(rawLandmarks, data.timestampMs)
            : rawLandmarks;

          this._latestResult = {
            raw: null,
            smoothedLandmarks: smoothed,
            timestampMs: data.timestampMs,
          };
        } else {
          this.smoother?.reset();
          this._latestResult = {
            raw: null,
            smoothedLandmarks: null,
            timestampMs: data.timestampMs,
          };
        }
      }
    };

    this.worker.onerror = (err) => {
      console.error('[PoseTracker] Worker runtime error:', err);
      this._isBusy = false;
    };
  }

  /**
   * Send a video frame to the worker for inference.
   *
   * Non-blocking and backpressure-protected:
   * - If worker is busy processing previous frame, drops frame immediately.
   * - If video has not advanced to a new frame, skips.
   * - Extracts ImageBitmap asynchronously and transfers ownership with zero copy.
   */
  sendFrame(video: HTMLVideoElement): void {
    if (!this._isReady || this._isBusy || !this.worker) return;
    if (video.readyState < 2) return;

    const videoTime = video.currentTime;
    if (videoTime === this._lastVideoTime) return;
    this._lastVideoTime = videoTime;

    let timestampMs = Math.round(performance.now());
    if (timestampMs <= this.lastTimestamp) {
      timestampMs = this.lastTimestamp + 1;
    }
    this.lastTimestamp = timestampMs;

    this._isBusy = true;

    createImageBitmap(video)
      .then((bitmap) => {
        if (!this.worker || !this._isReady) {
          bitmap.close();
          this._isBusy = false;
          return;
        }

        // Transfer ownership of ImageBitmap to worker (0ms transfer)
        this.worker.postMessage(
          {
            type: 'DETECT',
            bitmap,
            timestampMs,
          },
          [bitmap]
        );
      })
      .catch((err) => {
        console.debug('[PoseTracker] createImageBitmap failed:', err);
        this._isBusy = false;
      });
  }

  /**
   * Release worker and model resources.
   */
  destroy(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'CLOSE' });
        this.worker.terminate();
      } catch (err) {
        console.debug('[PoseTracker] Error terminating worker:', err);
      }
      this.worker = null;
    }

    this.smoother?.reset();
    this.smoother = null;
    this._isReady = false;
    this._isBusy = false;
    this._latestResult = null;
    this.lastTimestamp = -1;
    this._lastVideoTime = -1;
  }
}

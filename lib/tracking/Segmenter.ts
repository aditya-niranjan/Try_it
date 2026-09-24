/**
 * Segmenter — wraps @mediapipe/tasks-vision ImageSegmenter.
 *
 * Responsibilities:
 *   - Load selfie_multiclass_256x256.tflite model
 *   - Asynchronously compute person/body segmentation masks
 *   - Provide category/confidence mask data to OcclusionPass
 *   - Non-blocking execution to safeguard the 16.6ms / 60 FPS frame budget
 */

import { FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';

export interface SegmenterOptions {
  modelPath?: string;
  wasmBasePath?: string;
  delegate?: 'GPU' | 'CPU';
}

export interface SegmentationResult {
  /** Mask as a Float32Array or Uint8Array, one value per pixel (0 = bg, 1 = person/skin). */
  mask: Float32Array | Uint8Array | null;
  width: number;
  height: number;
  timestampMs: number;
}

const DEFAULT_OPTIONS: Required<SegmenterOptions> = {
  modelPath: '/models/selfie_multiclass_256x256.tflite',
  wasmBasePath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
  delegate: 'GPU',
};

export class Segmenter {
  private segmenter: ImageSegmenter | null = null;
  private isInitializing = false;
  private isBusy = false;
  private _isReady = false;
  private _activeDelegate: 'GPU' | 'CPU' = 'CPU';
  private latestResult: SegmentationResult | null = null;
  private lastInferenceTime = -1;

  get isReady(): boolean {
    return this._isReady;
  }

  get activeDelegate(): 'GPU' | 'CPU' {
    return this._activeDelegate;
  }

  /**
   * Initialize ImageSegmenter with GPU delegate and CPU fallback.
   */
  async init(options?: SegmenterOptions): Promise<void> {
    if (this.segmenter || this.isInitializing) return;
    this.isInitializing = true;

    const opts = { ...DEFAULT_OPTIONS, ...options };

    try {
      const vision = await FilesetResolver.forVisionTasks(opts.wasmBasePath);

      // Try GPU delegate first
      try {
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: opts.modelPath,
            delegate: 'GPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        this._activeDelegate = 'GPU';
      } catch (gpuErr) {
        console.warn('[Segmenter] GPU delegate failed, falling back to CPU:', gpuErr);
        this.segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: opts.modelPath,
            delegate: 'CPU',
          },
          runningMode: 'IMAGE',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        this._activeDelegate = 'CPU';
      }

      this._isReady = true;
      console.log(`[Segmenter] Initialized with ${this._activeDelegate} delegate`);
    } catch (err) {
      console.warn('[Segmenter] Initialization failed:', err);
      this._isReady = false;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Non-blocking segmentation dispatch.
   * If segmenter is busy, skips frame without stalling render loop.
   */
  segment(video: HTMLVideoElement, timestampMs: number): SegmentationResult | null {
    if (!this.segmenter || !this._isReady || this.isBusy) {
      return this.latestResult;
    }

    // Throttle to at most ~20-30 FPS to conserve GPU cycles for 60 FPS rendering
    if (timestampMs - this.lastInferenceTime < 33) {
      return this.latestResult;
    }

    this.isBusy = true;
    this.lastInferenceTime = timestampMs;

    try {
      const result = this.segmenter.segment(video);
      if (result && result.categoryMask) {
        const mask = result.categoryMask;
        const width = mask.width;
        const height = mask.height;
        let data: Uint8Array | null = null;

        if (mask.hasUint8Array()) {
          data = mask.getAsUint8Array();
        }

        this.latestResult = {
          mask: data ? new Uint8Array(data) : null,
          width,
          height,
          timestampMs,
        };

        result.close();
      }
    } catch (err) {
      // Soft failure without breaking rAF
      console.debug('[Segmenter] Segment frame error:', err);
    } finally {
      this.isBusy = false;
    }

    return this.latestResult;
  }

  /**
   * Clean up resources.
   */
  destroy(): void {
    if (this.segmenter) {
      try {
        this.segmenter.close();
      } catch {
        // Ignore close errors
      }
      this.segmenter = null;
    }
    this._isReady = false;
    this.latestResult = null;
  }
}

/**
 * Segmenter — wraps @mediapipe/tasks-vision ImageSegmenter.
 *
 * Responsibilities:
 *   - Load selfie_multiclass_256x256.task model
 *   - Produce a person segmentation mask per frame (downsampled for perf)
 *   - Provide the mask to OcclusionPass for depth compositing
 */

export interface SegmenterOptions {
  modelPath?: string;
}

export interface SegmentationResult {
  /** Mask as a Float32Array or Uint8Array, one value per pixel (0 = bg, 1 = person). */
  mask: Float32Array | null;
  width: number;
  height: number;
}

export class Segmenter {
  private segmenter: unknown = null;

  /**
   * Initialize the ImageSegmenter with model.
   * TODO: Load model, configure for selfie segmentation.
   */
  async init(_options?: SegmenterOptions): Promise<void> {
    // TODO: implement in P5
    throw new Error('Segmenter.init() not implemented');
  }

  /**
   * Run segmentation on the current video frame.
   * TODO: Call segmenter.segmentForVideo(), return mask data.
   */
  segment(_video: HTMLVideoElement, _timestampMs: number): SegmentationResult | null {
    // TODO: implement in P5
    return null;
  }

  /**
   * Release model resources.
   */
  destroy(): void {
    // TODO: implement in P5
    this.segmenter = null;
  }
}

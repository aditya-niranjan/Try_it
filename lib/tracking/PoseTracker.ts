/**
 * PoseTracker — wraps @mediapipe/tasks-vision PoseLandmarker.
 *
 * Responsibilities:
 *   - Load the pose_landmarker_lite.task model (GPU delegate preferred)
 *   - Run per-frame detection on the video element
 *   - Return 33 smoothed landmarks (One Euro filter applied)
 */

import type { PoseLandmarkerResult } from '@mediapipe/tasks-vision';

export interface PoseTrackerOptions {
  modelPath?: string;
  numPoses?: number;
  minDetectionConfidence?: number;
  minTrackingConfidence?: number;
}

export class PoseTracker {
  private landmarker: unknown = null;

  /**
   * Initialize the PoseLandmarker with model + options.
   * TODO: Load model from /models/pose_landmarker_lite.task, configure GPU delegate.
   */
  async init(_options?: PoseTrackerOptions): Promise<void> {
    // TODO: implement in P2
    throw new Error('PoseTracker.init() not implemented');
  }

  /**
   * Run pose detection on the current video frame.
   * TODO: Call landmarker.detectForVideo(), apply One Euro smoothing, return result.
   */
  detect(_video: HTMLVideoElement, _timestampMs: number): PoseLandmarkerResult | null {
    // TODO: implement in P2
    return null;
  }

  /**
   * Release model resources.
   */
  destroy(): void {
    // TODO: implement in P2
    this.landmarker = null;
  }
}

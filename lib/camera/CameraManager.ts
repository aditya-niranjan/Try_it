/**
 * CameraManager — handles getUserMedia lifecycle, video element, and mirroring.
 *
 * Responsibilities:
 *   - Request webcam access with preferred constraints
 *   - Provide the HTMLVideoElement to consumers (tracking, rendering)
 *   - Clean stop / release of MediaStream tracks
 */

export interface CameraConstraints {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  frameRate?: number;
}

export class CameraManager {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private _isRunning = false;

  /** Whether the camera is currently streaming. */
  get isRunning(): boolean {
    return this._isRunning;
  }

  /**
   * Start the camera and attach to an internal video element.
   * TODO: Implement getUserMedia, create/configure video element, handle errors.
   */
  async start(_constraints?: CameraConstraints): Promise<HTMLVideoElement> {
    // TODO: implement in P1
    throw new Error('CameraManager.start() not implemented');
  }

  /**
   * Stop the camera, release all tracks, and clean up the video element.
   * TODO: Implement track stopping and resource cleanup.
   */
  stop(): void {
    // TODO: implement in P1
    this._isRunning = false;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.videoElement = null;
  }

  /**
   * Return the active HTMLVideoElement (or null if not started).
   */
  getVideoElement(): HTMLVideoElement | null {
    return this.videoElement;
  }
}

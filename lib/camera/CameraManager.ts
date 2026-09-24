/**
 * CameraManager — handles getUserMedia lifecycle, video element, and mirroring.
 *
 * Responsibilities:
 *   - Request webcam access with preferred constraints
 *   - Provide the HTMLVideoElement to consumers (tracking, rendering)
 *   - Clean stop / release of MediaStream tracks
 *   - Typed error handling for permission/device failures
 */

export interface CameraConstraints {
  width?: number;
  height?: number;
  facingMode?: 'user' | 'environment';
  frameRate?: number;
}

export type CameraErrorType =
  | 'permission-denied'
  | 'not-found'
  | 'not-readable'
  | 'overconstrained'
  | 'unknown';

export class CameraError extends Error {
  readonly type: CameraErrorType;

  constructor(type: CameraErrorType, message: string) {
    super(message);
    this.name = 'CameraError';
    this.type = type;
  }

  /** Map a DOMException from getUserMedia to a typed CameraError. */
  static fromDOMException(err: unknown): CameraError {
    if (err instanceof DOMException) {
      switch (err.name) {
        case 'NotAllowedError':
          return new CameraError(
            'permission-denied',
            'Camera access was denied. Please allow camera permission in your browser settings.'
          );
        case 'NotFoundError':
          return new CameraError(
            'not-found',
            'No camera device found. Please connect a webcam and try again.'
          );
        case 'NotReadableError':
        case 'AbortError':
          return new CameraError(
            'not-readable',
            'Camera is in use by another application. Please close other apps using the camera.'
          );
        case 'OverconstrainedError':
          return new CameraError(
            'overconstrained',
            'Camera does not support the requested resolution. Trying with default settings.'
          );
        default:
          return new CameraError('unknown', `Camera error: ${err.message}`);
      }
    }
    if (err instanceof Error) {
      return new CameraError('unknown', err.message);
    }
    return new CameraError('unknown', 'An unknown camera error occurred.');
  }
}

const DEFAULT_CONSTRAINTS: CameraConstraints = {
  width: 1280,
  height: 720,
  facingMode: 'user',
  frameRate: 30,
};

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
   * Creates an off-screen <video>, attaches the MediaStream, waits for
   * loadedmetadata + play(), then returns the video element.
   */
  async start(constraints?: CameraConstraints): Promise<HTMLVideoElement> {
    // If already running, stop first
    if (this._isRunning) {
      this.stop();
    }

    const merged = { ...DEFAULT_CONSTRAINTS, ...constraints };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: merged.width },
          height: { ideal: merged.height },
          facingMode: merged.facingMode,
          frameRate: { ideal: merged.frameRate },
        },
        audio: false,
      });
    } catch (err) {
      throw CameraError.fromDOMException(err);
    }

    // Create off-screen video element
    const video = document.createElement('video');
    video.setAttribute('playsinline', 'true');
    video.setAttribute('autoplay', 'true');
    video.muted = true;
    video.srcObject = this.stream;

    // Wait for metadata to load and video to start playing
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new CameraError('unknown', 'Camera timed out while starting.'));
      }, 10000);

      video.onloadedmetadata = () => {
        video
          .play()
          .then(() => {
            clearTimeout(timeout);
            resolve();
          })
          .catch((playErr) => {
            clearTimeout(timeout);
            reject(CameraError.fromDOMException(playErr));
          });
      };

      video.onerror = () => {
        clearTimeout(timeout);
        reject(new CameraError('unknown', 'Video element encountered an error.'));
      };
    });

    this.videoElement = video;
    this._isRunning = true;

    return video;
  }

  /**
   * Stop the camera, release all tracks, and clean up the video element.
   */
  stop(): void {
    this._isRunning = false;

    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.srcObject = null;
      this.videoElement.onloadedmetadata = null;
      this.videoElement.onerror = null;
    }

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
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

  /**
   * Return the raw MediaStream (for future use by tracking).
   */
  getStream(): MediaStream | null {
    return this.stream;
  }
}

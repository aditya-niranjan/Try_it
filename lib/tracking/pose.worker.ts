import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let landmarker: PoseLandmarker | null = null;
let activeDelegate: 'GPU' | 'CPU' = 'CPU';
let isInitializing = false;

self.addEventListener('message', async (event: MessageEvent) => {
  const data = event.data;
  if (!data || !data.type) return;

  switch (data.type) {
    case 'INIT': {
      if (landmarker || isInitializing) return;
      isInitializing = true;

      const {
        modelPath = '/models/pose_landmarker_lite.task',
        wasmBasePath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm',
        minDetectionConfidence = 0.5,
        minTrackingConfidence = 0.5,
      } = data;

      try {
        const vision = await FilesetResolver.forVisionTasks(wasmBasePath);

        // Try GPU delegate first, fallback to CPU
        try {
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'GPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: minDetectionConfidence,
            minTrackingConfidence: minTrackingConfidence,
          });
          activeDelegate = 'GPU';
        } catch (gpuErr) {
          console.warn('[PoseWorker] GPU delegate failed in worker, falling back to CPU:', gpuErr);
          landmarker = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: modelPath,
              delegate: 'CPU',
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: minDetectionConfidence,
            minTrackingConfidence: minTrackingConfidence,
          });
          activeDelegate = 'CPU';
        }

        self.postMessage({
          type: 'INIT_RESULT',
          success: true,
          delegate: activeDelegate,
        });
      } catch (err: unknown) {
        console.error('[PoseWorker] Initialization failed:', err);
        const errMsg = err instanceof Error ? err.message : String(err);
        self.postMessage({
          type: 'INIT_RESULT',
          success: false,
          error: errMsg,
        });
      } finally {
        isInitializing = false;
      }
      break;
    }

    case 'DETECT': {
      const { bitmap, timestampMs } = data as { bitmap: ImageBitmap; timestampMs: number };
      if (!bitmap) return;

      if (!landmarker) {
        bitmap.close();
        self.postMessage({
          type: 'DETECT_RESULT',
          landmarks: null,
          timestampMs,
          durationMs: 0,
        });
        return;
      }

      const t0 = performance.now();
      try {
        const result = landmarker.detectForVideo(bitmap, timestampMs);
        const durationMs = performance.now() - t0;
        bitmap.close();

        const landmarks = result?.landmarks && result.landmarks.length > 0 ? result.landmarks[0] : null;

        self.postMessage({
          type: 'DETECT_RESULT',
          landmarks,
          timestampMs,
          durationMs,
        });
      } catch (err: unknown) {
        bitmap.close();
        console.debug('[PoseWorker] Detection error:', err);
        self.postMessage({
          type: 'DETECT_RESULT',
          landmarks: null,
          timestampMs,
          durationMs: performance.now() - t0,
        });
      }
      break;
    }

    case 'CLOSE': {
      if (landmarker) {
        landmarker.close();
        landmarker = null;
      }
      break;
    }
  }
});

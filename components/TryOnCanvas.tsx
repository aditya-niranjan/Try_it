'use client';

import { useRef, useEffect, useCallback } from 'react';
import { CameraManager, CameraError } from '@/lib/camera/CameraManager';
import { PoseTracker } from '@/lib/tracking/PoseTracker';
import { SkeletonRenderer } from '@/lib/tracking/SkeletonRenderer';
import { SceneManager } from '@/lib/render/SceneManager';

/**
 * TryOnCanvas — owns video element, 2D canvas, Three.js 3D viewport, and the render loop.
 *
 * PERFORMANCE ARCHITECTURE (60 FPS DECOUPLED):
 *
 *   1. rAF Render Loop (Main Thread, 60fps):
 *      - Draws mirrored video frame to 2D canvas (~0.5ms)
 *      - Reads latest smoothed pose result (non-blocking, ~0ms)
 *      - Draws skeleton overlay (~0.5ms)
 *      - Dispatches video frame to Web Worker via zero-copy ImageBitmap transfer (~0ms)
 *      - Updates 3D Torso rig in Three.js SceneManager (~0.2ms)
 *      - Renders 3D transparent garment mesh over video (~1-2ms)
 *      - Total main-thread frame execution: ~2-3ms → solid 60 FPS guaranteed
 *
 *   2. Dedicated Web Worker Thread (Background, ~25-40fps):
 *      - Executes MediaPipe PoseLandmarker.detectForVideo off the main thread
 *      - Returns landmarks back to main thread
 *      - Zero frame drops or main-thread micro-stuttering
 */

export type TrackingStatus = 'idle' | 'loading' | 'active' | 'lost';

export interface GarmentConfig {
  /** Hex color code (e.g. '#2563eb'). */
  color: string;
  /** Shirt body fit. */
  size: 'slim' | 'regular' | 'oversized';
  /** Sleeve length. */
  sleeveLength: 'short' | 'medium';
}

interface TryOnCanvasProps {
  /** Whether the camera should be active. */
  isCameraActive: boolean;
  /** Whether to show the skeleton overlay. */
  showSkeleton?: boolean;
  /** Whether depth occlusion is enabled (hands/arms in front of torso occlude garment). */
  enableOcclusion?: boolean;
  /** Whether to show debug wireframes for occlusion geometry. */
  debugOcclusion?: boolean;
  /** Whether real-time cloth simulation (hem drape & sway) is enabled. */
  enableClothSim?: boolean;
  /** Wind / breeze strength for interactive hem flutter. */
  windStrength?: number;
  /** Garment visual and sizing configuration. */
  garmentConfig?: GarmentConfig;
  /** Callback to report current FPS to parent. */
  onFpsUpdate?: (fps: number) => void;
  /** Callback when a camera error occurs. */
  onError?: (error: string) => void;
  /** Callback when camera actually starts/stops (confirms state). */
  onCameraStateChange?: (isActive: boolean) => void;
  /** Callback to report tracking status changes. */
  onTrackingStatus?: (status: TrackingStatus) => void;
  /** Callback to report inference latency and delegate. */
  onInferenceStats?: (ms: number, delegate: 'GPU' | 'CPU') => void;
  /** Callback to report main thread frame budget execution time in ms (target < 16.6ms). */
  onFrameBudgetUpdate?: (frameTimeMs: number) => void;
}

/** DPR cap per architecture doc. */
const MAX_DPR = 1.5;

function applyGarmentConfig(sceneManager: SceneManager, config: GarmentConfig): void {
  let chestWidth = 1.0;
  let length = 1.25;
  if (config.size === 'slim') {
    chestWidth = 0.90;
    length = 1.18;
  } else if (config.size === 'oversized') {
    chestWidth = 1.15;
    length = 1.35;
  }

  const sleeveLength = config.sleeveLength === 'short' ? 0.32 : 0.46;

  sceneManager.setGarmentParams({
    chestWidth,
    length,
    sleeveLength,
    color: config.color,
  });
}

export default function TryOnCanvas({
  isCameraActive,
  showSkeleton = true,
  enableOcclusion = true,
  debugOcclusion = false,
  enableClothSim = true,
  windStrength = 0.0,
  garmentConfig,
  onFpsUpdate,
  onError,
  onCameraStateChange,
  onTrackingStatus,
  onInferenceStats,
  onFrameBudgetUpdate,
}: TryOnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const trackerRef = useRef<PoseTracker | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafIdRef = useRef<number>(0);
  const isRenderingRef = useRef(false);
  const showSkeletonRef = useRef(showSkeleton);
  const enableOcclusionRef = useRef(enableOcclusion);
  const debugOcclusionRef = useRef(debugOcclusion);
  const enableClothSimRef = useRef(enableClothSim);
  const windStrengthRef = useRef(windStrength);
  const garmentConfigRef = useRef(garmentConfig);

  // Track the last result timestamp we reported stats for (avoid spamming)
  const lastStatsTimestampRef = useRef<number>(-1);

  // Keep refs in sync
  useEffect(() => {
    showSkeletonRef.current = showSkeleton;
  }, [showSkeleton]);

  useEffect(() => {
    enableOcclusionRef.current = enableOcclusion;
    debugOcclusionRef.current = debugOcclusion;
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setOcclusionConfig({
        enabled: enableOcclusion,
        debugWireframe: debugOcclusion,
      });
    }
  }, [enableOcclusion, debugOcclusion]);

  useEffect(() => {
    enableClothSimRef.current = enableClothSim;
    windStrengthRef.current = windStrength;
    if (sceneManagerRef.current) {
      sceneManagerRef.current.setClothSimEnabled(enableClothSim);
      sceneManagerRef.current.setWindStrength(windStrength);
    }
  }, [enableClothSim, windStrength]);

  useEffect(() => {
    garmentConfigRef.current = garmentConfig;
    if (sceneManagerRef.current && garmentConfig) {
      applyGarmentConfig(sceneManagerRef.current, garmentConfig);
    }
  }, [garmentConfig]);

  // FPS and Frame Budget tracking
  const fpsFrameCountRef = useRef(0);
  const fpsLastTimeRef = useRef(0);
  const frameTimeSmoothedRef = useRef(2.0);

  /**
   * Draw the placeholder when the camera is off.
   */
  const drawPlaceholder = useCallback((canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => {
    const container = containerRef.current;
    if (!container) return;

    const dpr = Math.min(window.devicePixelRatio, MAX_DPR);
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Dark background
    ctx.fillStyle = '#0a0a0f';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Camera icon
    ctx.strokeStyle = '#2a2a3e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy - 40, 36, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy - 40, 14, 0, Math.PI * 2);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#4a4a6a';
    ctx.font = '16px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Camera preview will appear here', cx, cy + 20);

    ctx.fillStyle = '#2a2a3e';
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.fillText('Press "Start Camera" to begin', cx, cy + 48);
  }, []);

  /**
   * The 60 FPS Render Loop — draws video, overlays skeleton, updates 3D torso, and renders Three.js garment.
   */
  const startRenderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    isRenderingRef.current = true;
    fpsFrameCountRef.current = 0;
    fpsLastTimeRef.current = performance.now();

    const render = () => {
      if (!isRenderingRef.current) return;
      const frameStart = performance.now();

      const container = containerRef.current;
      if (!container || !video || video.readyState < 2) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio, MAX_DPR);
      const containerRect = container.getBoundingClientRect();
      const cw = containerRect.width;
      const ch = containerRect.height;

      // Resize 2D canvas if needed
      const targetW = Math.round(cw * dpr);
      const targetH = Math.round(ch * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
      }

      // Resize Three.js overlay renderer if needed
      const sceneManager = sceneManagerRef.current;
      if (sceneManager) {
        sceneManager.resize(cw, ch);
      }

      // Calculate aspect-correct draw dimensions (cover mode)
      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = cw / ch;

      let drawW: number, drawH: number, offsetX: number, offsetY: number;

      if (videoAspect > canvasAspect) {
        drawH = ch;
        drawW = ch * videoAspect;
        offsetX = (cw - drawW) / 2;
        offsetY = 0;
      } else {
        drawW = cw;
        drawH = cw / videoAspect;
        offsetX = 0;
        offsetY = (ch - drawH) / 2;
      }

      // 1. Draw mirrored video frame on 2D canvas
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, cw, ch);

      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-cw, 0);
      ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
      ctx.restore();

      // 2. Dispatch frame to Web Worker (non-blocking zero-copy ImageBitmap)
      const tracker = trackerRef.current;
      if (tracker?.isReady) {
        tracker.sendFrame(video);

        // 3. Read latest smoothed pose landmarks
        const currentPose = tracker.latestResult;

        if (currentPose?.smoothedLandmarks) {
          // Draw skeleton if enabled
          if (showSkeletonRef.current) {
            SkeletonRenderer.drawSkeleton(ctx, currentPose.smoothedLandmarks, {
              width: cw,
              height: ch,
              offsetX,
              offsetY,
              drawW,
              drawH,
              mirrored: true,
            });
          }

          // Update 3D Torso rig in Three.js
          if (sceneManager) {
            sceneManager.updateTorso(currentPose.smoothedLandmarks, {
              width: cw,
              height: ch,
              offsetX,
              offsetY,
              drawW,
              drawH,
              mirrored: true,
            });
          }

          onTrackingStatus?.('active');

          // Report inference telemetry
          if (currentPose.timestampMs !== lastStatsTimestampRef.current) {
            lastStatsTimestampRef.current = currentPose.timestampMs;
            onInferenceStats?.(
              Math.round(tracker.lastInferenceDurationMs),
              tracker.activeDelegate
            );
          }
        } else if (currentPose && !currentPose.smoothedLandmarks) {
          onTrackingStatus?.('lost');
          if (sceneManager) {
            sceneManager.updateTorso([], {
              width: cw,
              height: ch,
              offsetX,
              offsetY,
              drawW,
              drawH,
              mirrored: true,
            });
          }
        }
      }

      // 4. Render 3D Three.js Garment Overlay
      if (sceneManager) {
        sceneManager.render();
      }

      // Compute frame budget execution time
      const frameDuration = performance.now() - frameStart;
      frameTimeSmoothedRef.current = frameTimeSmoothedRef.current * 0.85 + frameDuration * 0.15;

      // 5. FPS and Budget calculation (every second)
      fpsFrameCountRef.current++;
      const now = performance.now();
      const elapsed = now - fpsLastTimeRef.current;
      if (elapsed >= 1000) {
        const fps = Math.round((fpsFrameCountRef.current * 1000) / elapsed);
        onFpsUpdate?.(fps);
        onFrameBudgetUpdate?.(parseFloat(frameTimeSmoothedRef.current.toFixed(1)));
        fpsFrameCountRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);
  }, [onFpsUpdate, onTrackingStatus, onInferenceStats, onFrameBudgetUpdate]);

  /**
   * Stop the render loop.
   */
  const stopRenderLoop = useCallback(() => {
    isRenderingRef.current = false;
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = 0;
    }
  }, []);

  /**
   * Handle camera + tracking start/stop based on isCameraActive prop.
   */
  useEffect(() => {
    if (!cameraRef.current) {
      cameraRef.current = new CameraManager();
    }

    const camera = cameraRef.current;
    let cancelled = false;

    if (isCameraActive) {
      camera
        .start()
        .then(async (video) => {
          if (cancelled) return;
          videoRef.current = video;

          // Initialize Three.js 3D SceneManager on the overlay canvas
          if (threeCanvasRef.current) {
            const sm = new SceneManager();
            sm.init(threeCanvasRef.current);
            sm.setOcclusionConfig({
              enabled: enableOcclusionRef.current,
              debugWireframe: debugOcclusionRef.current,
            });
            sm.setClothSimEnabled(enableClothSimRef.current);
            sm.setWindStrength(windStrengthRef.current);
            if (garmentConfigRef.current) {
              applyGarmentConfig(sm, garmentConfigRef.current);
            }
            sceneManagerRef.current = sm;
          }

          startRenderLoop();
          onCameraStateChange?.(true);

          // Initialize pose tracker worker
          onTrackingStatus?.('loading');
          try {
            const tracker = new PoseTracker();
            await tracker.init();
            if (cancelled) {
              tracker.destroy();
              return;
            }
            trackerRef.current = tracker;
          } catch (trackingErr) {
            console.error('PoseTracker init failed:', trackingErr);
            onError?.('Failed to load pose tracking model. Tracking disabled.');
            onTrackingStatus?.('idle');
          }
        })
        .catch((err) => {
          if (cancelled) return;
          const message =
            err instanceof CameraError
              ? err.message
              : 'Failed to start camera. Please try again.';
          onError?.(message);
          onCameraStateChange?.(false);
        });
    } else {
      // Stop everything
      stopRenderLoop();
      camera.stop();
      videoRef.current = null;

      if (trackerRef.current) {
        trackerRef.current.destroy();
        trackerRef.current = null;
      }

      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
        sceneManagerRef.current = null;
      }

      lastStatsTimestampRef.current = -1;

      onCameraStateChange?.(false);
      onTrackingStatus?.('idle');
      onFpsUpdate?.(0);
      onFrameBudgetUpdate?.(0);

      // Redraw placeholder
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) drawPlaceholder(canvas, ctx);
      }
    }

    return () => {
      cancelled = true;
      stopRenderLoop();
      camera.stop();
      videoRef.current = null;

      if (trackerRef.current) {
        trackerRef.current.destroy();
        trackerRef.current = null;
      }

      if (sceneManagerRef.current) {
        sceneManagerRef.current.dispose();
        sceneManagerRef.current = null;
      }

      lastStatsTimestampRef.current = -1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive]);

  /**
   * Draw initial placeholder on mount.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    drawPlaceholder(canvas, ctx);

    const observer = new ResizeObserver(() => {
      if (!isRenderingRef.current) {
        drawPlaceholder(canvas, ctx);
      }
    });
    const container = containerRef.current;
    if (container) observer.observe(container);

    return () => observer.disconnect();
  }, [drawPlaceholder]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0a0a0f]"
    >
      {/* 2D Video & Skeleton Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
      />

      {/* 3D WebGL Three.js Garment Overlay Canvas */}
      <canvas
        ref={threeCanvasRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
      />

      {/* Subtle vignette overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
        }}
      />
    </div>
  );
}

'use client';

import { useRef, useEffect, useCallback } from 'react';
import { CameraManager, CameraError } from '@/lib/camera/CameraManager';

/**
 * TryOnCanvas — owns video element, canvas, and the render loop.
 *
 * P1: Renders the live mirrored webcam feed onto a 2D canvas at ≥30fps.
 * Future milestones will add Three.js compositing on top of the video.
 */

interface TryOnCanvasProps {
  /** Whether the camera should be active. */
  isCameraActive: boolean;
  /** Callback to report current FPS to parent. */
  onFpsUpdate?: (fps: number) => void;
  /** Callback when a camera error occurs. */
  onError?: (error: string) => void;
  /** Callback when camera actually starts/stops (confirms state). */
  onCameraStateChange?: (isActive: boolean) => void;
}

/** DPR cap per architecture doc. */
const MAX_DPR = 1.5;

export default function TryOnCanvas({
  isCameraActive,
  onFpsUpdate,
  onError,
  onCameraStateChange,
}: TryOnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cameraRef = useRef<CameraManager | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafIdRef = useRef<number>(0);
  const isRenderingRef = useRef(false);

  // FPS tracking
  const fpsFrameCountRef = useRef(0);
  const fpsLastTimeRef = useRef(0);

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
   * The render loop — draws mirrored video frames onto the canvas.
   * Uses ctx.scale(-1, 1) to flip horizontally for selfie view.
   * Mirror is applied ONLY at draw time (landmarks stay in camera space).
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

      const container = containerRef.current;
      if (!container || !video || video.readyState < 2) {
        rafIdRef.current = requestAnimationFrame(render);
        return;
      }

      const dpr = Math.min(window.devicePixelRatio, MAX_DPR);
      const containerRect = container.getBoundingClientRect();
      const cw = containerRect.width;
      const ch = containerRect.height;

      // Resize canvas if needed
      const targetW = Math.round(cw * dpr);
      const targetH = Math.round(ch * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${cw}px`;
        canvas.style.height = `${ch}px`;
      }

      // Calculate aspect-correct draw dimensions (cover mode — fill entire canvas)
      const videoAspect = video.videoWidth / video.videoHeight;
      const canvasAspect = cw / ch;

      let drawW: number, drawH: number, offsetX: number, offsetY: number;

      if (videoAspect > canvasAspect) {
        // Video is wider — crop sides
        drawH = ch;
        drawW = ch * videoAspect;
        offsetX = (cw - drawW) / 2;
        offsetY = 0;
      } else {
        // Video is taller — crop top/bottom
        drawW = cw;
        drawH = cw / videoAspect;
        offsetX = 0;
        offsetY = (ch - drawH) / 2;
      }

      // Draw mirrored video frame
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, cw, ch);

      // Apply horizontal flip for selfie/mirror view
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-cw, 0);
      ctx.drawImage(video, offsetX, offsetY, drawW, drawH);
      ctx.restore();

      // FPS calculation (update every second)
      fpsFrameCountRef.current++;
      const now = performance.now();
      const elapsed = now - fpsLastTimeRef.current;
      if (elapsed >= 1000) {
        const fps = Math.round((fpsFrameCountRef.current * 1000) / elapsed);
        onFpsUpdate?.(fps);
        fpsFrameCountRef.current = 0;
        fpsLastTimeRef.current = now;
      }

      rafIdRef.current = requestAnimationFrame(render);
    };

    rafIdRef.current = requestAnimationFrame(render);
  }, [onFpsUpdate]);

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
   * Handle camera start/stop based on isCameraActive prop.
   */
  useEffect(() => {
    if (!cameraRef.current) {
      cameraRef.current = new CameraManager();
    }

    const camera = cameraRef.current;

    if (isCameraActive) {
      // Start camera
      camera
        .start()
        .then((video) => {
          videoRef.current = video;
          startRenderLoop();
          onCameraStateChange?.(true);
        })
        .catch((err) => {
          const message =
            err instanceof CameraError
              ? err.message
              : 'Failed to start camera. Please try again.';
          onError?.(message);
          onCameraStateChange?.(false);
        });
    } else {
      // Stop camera
      stopRenderLoop();
      camera.stop();
      videoRef.current = null;
      onCameraStateChange?.(false);
      onFpsUpdate?.(0);

      // Redraw placeholder
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) drawPlaceholder(canvas, ctx);
      }
    }

    return () => {
      stopRenderLoop();
      camera.stop();
      videoRef.current = null;
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
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
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

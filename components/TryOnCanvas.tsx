'use client';

import { useRef, useEffect } from 'react';

/**
 * TryOnCanvas — owns video element, canvas, Three.js renderer, and the frame loop.
 *
 * For P0: renders an empty dark canvas area with a placeholder message.
 * Future milestones will wire up CameraManager, PoseTracker, SceneManager, etc.
 */

interface TryOnCanvasProps {
  /** Whether the camera is active (controls placeholder vs video display). */
  isCameraActive: boolean;
}

export default function TryOnCanvas({ isCameraActive }: TryOnCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw placeholder on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;

      const dpr = Math.min(window.devicePixelRatio, 1.5);
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;

      // Draw dark background
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, rect.width, rect.height);

      if (!isCameraActive) {
        // Draw placeholder content
        const cx = rect.width / 2;
        const cy = rect.height / 2;

        // Camera icon (simple circle + triangle)
        ctx.strokeStyle = '#2a2a3e';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy - 40, 36, 0, Math.PI * 2);
        ctx.stroke();

        // Inner lens circle
        ctx.beginPath();
        ctx.arc(cx, cy - 40, 14, 0, Math.PI * 2);
        ctx.stroke();

        // Placeholder text
        ctx.fillStyle = '#4a4a6a';
        ctx.font = '16px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Camera preview will appear here', cx, cy + 20);

        ctx.fillStyle = '#2a2a3e';
        ctx.font = '13px Inter, system-ui, sans-serif';
        ctx.fillText('Press "Start Camera" to begin', cx, cy + 48);
      }
    };

    resizeCanvas();

    const observer = new ResizeObserver(resizeCanvas);
    const container = containerRef.current;
    if (container) observer.observe(container);

    return () => observer.disconnect();
  }, [isCameraActive]);

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

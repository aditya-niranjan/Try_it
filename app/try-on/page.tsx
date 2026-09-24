'use client';

import { useState, useCallback } from 'react';
import TryOnCanvas from '@/components/TryOnCanvas';

/**
 * /try-on — the ONLY page in Milestone 1.
 *
 * P1: Dark UI shell with working camera controls:
 * - TryOnCanvas renders mirrored webcam feed
 * - Start/Stop Camera buttons are functional
 * - Live FPS counter in header
 * - Error notifications for camera failures
 */

export default function TryOnPage() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [fps, setFps] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const handleStartCamera = useCallback(() => {
    setError(null);
    setIsStarting(true);
    setIsCameraActive(true);
  }, []);

  const handleStopCamera = useCallback(() => {
    setIsCameraActive(false);
    setIsStarting(false);
    setFps(0);
  }, []);

  const handleFpsUpdate = useCallback((newFps: number) => {
    setFps(newFps);
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    setIsCameraActive(false);
    setIsStarting(false);
  }, []);

  const handleCameraStateChange = useCallback((isActive: boolean) => {
    setIsStarting(false);
    if (!isActive && isCameraActive) {
      setIsCameraActive(false);
    }
  }, [isCameraActive]);

  const dismissError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <div className="flex flex-col h-screen bg-[#060609] text-white overflow-hidden">
      {/* Header bar */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">Virtual Try-On</h1>
            <p className="text-[11px] text-white/40">Milestone 1 — Controlled Fitting Room</p>
          </div>
        </div>

        {/* Live FPS counter */}
        <div className="flex items-center gap-2">
          <div
            className={`px-3 py-1.5 rounded-lg border text-[11px] font-mono transition-colors duration-300 ${
              isCameraActive && fps > 0
                ? fps >= 30
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : fps >= 20
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-white/[0.04] border-white/[0.06] text-white/30'
            }`}
          >
            {isCameraActive && fps > 0 ? `${fps} fps` : '-- fps'}
          </div>
        </div>
      </header>

      {/* Error notification */}
      {error && (
        <div className="mx-6 mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300 animate-in fade-in slide-in-from-top-2">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="flex-1">{error}</span>
          <button
            onClick={dismissError}
            className="shrink-0 p-1 rounded-lg hover:bg-white/[0.06] transition-colors"
            aria-label="Dismiss error"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Main canvas area */}
      <main className="flex-1 flex gap-4 p-4 min-h-0">
        {/* Camera / 3D viewport */}
        <div className="flex-1 min-w-0">
          <TryOnCanvas
            isCameraActive={isCameraActive}
            onFpsUpdate={handleFpsUpdate}
            onError={handleError}
            onCameraStateChange={handleCameraStateChange}
          />
        </div>

        {/* Side panel — garment parameters (disabled placeholder for P0) */}
        <aside className="w-72 shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-5 overflow-y-auto">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-white/30">
            Garment Settings
          </h2>

          {/* Color picker placeholder */}
          <div className="space-y-2">
            <label className="text-xs text-white/40">Color</label>
            <div className="flex gap-2">
              {['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6', '#ffffff'].map(
                (color) => (
                  <button
                    key={color}
                    disabled
                    className="w-7 h-7 rounded-full border-2 border-white/[0.08] opacity-40 cursor-not-allowed transition-opacity"
                    style={{ backgroundColor: color }}
                    aria-label={`Select color ${color}`}
                  />
                )
              )}
            </div>
          </div>

          {/* Size slider placeholders */}
          {[
            { label: 'Chest Width', value: 50 },
            { label: 'Length', value: 60 },
            { label: 'Sleeve Length', value: 40 },
          ].map(({ label, value }) => (
            <div key={label} className="space-y-2">
              <div className="flex justify-between">
                <label className="text-xs text-white/40">{label}</label>
                <span className="text-xs text-white/20 font-mono">{value}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full rounded-full bg-white/10"
                  style={{ width: `${value}%` }}
                />
              </div>
            </div>
          ))}

          <div className="mt-auto pt-4 border-t border-white/[0.06]">
            <p className="text-[11px] text-white/20 text-center">
              Controls will be enabled after tracking is live
            </p>
          </div>
        </aside>
      </main>

      {/* Bottom control bar */}
      <footer className="px-6 py-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-center gap-3">
          {/* Start Camera button */}
          <button
            disabled={isCameraActive || isStarting}
            onClick={handleStartCamera}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl
              bg-gradient-to-r from-violet-600 to-fuchsia-600
              text-sm font-medium
              transition-all duration-200
              ${isCameraActive || isStarting
                ? 'opacity-50 cursor-not-allowed'
                : 'opacity-100 hover:shadow-lg hover:shadow-violet-500/25 hover:scale-[1.02] active:scale-[0.98] cursor-pointer'
              }
            `}
            id="btn-start-camera"
          >
            {isStarting ? (
              /* Loading spinner */
              <svg
                className="animate-spin"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : (
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
            )}
            {isStarting ? 'Starting...' : 'Start Camera'}
          </button>

          {/* Stop Camera button */}
          <button
            disabled={!isCameraActive}
            onClick={handleStopCamera}
            className={`
              flex items-center gap-2 px-5 py-2.5 rounded-xl
              bg-white/[0.06] border border-white/[0.08]
              text-sm font-medium
              transition-all duration-200
              ${!isCameraActive
                ? 'text-white/40 opacity-50 cursor-not-allowed'
                : 'text-white/80 opacity-100 hover:bg-white/[0.1] hover:border-white/[0.15] cursor-pointer'
              }
            `}
            id="btn-stop-camera"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            </svg>
            Stop Camera
          </button>
        </div>
      </footer>
    </div>
  );
}

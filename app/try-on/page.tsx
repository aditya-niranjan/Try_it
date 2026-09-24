'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { TrackingStatus, GarmentConfig } from '@/components/TryOnCanvas';

const TryOnCanvas = dynamic(() => import('@/components/TryOnCanvas'), {
  ssr: false,
  loading: () => (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-white/[0.06] bg-[#0a0a0f] flex items-center justify-center">
      <div className="flex flex-col items-center gap-2">
        <div className="w-6 h-6 border-2 border-violet-500/30 border-t-violet-400 rounded-full animate-spin" />
        <span className="text-white/30 text-xs font-mono">Initializing canvas...</span>
      </div>
    </div>
  ),
});

/**
 * /try-on — the ONLY page in Milestone 1.
 *
 * P3: 3D Parametric T-Shirt Torso Rig Tracking:
 * - Real-time MediaPipe PoseLandmarker inference (Web Worker)
 * - 3D procedural T-shirt BufferGeometry rendered via Three.js
 * - Torso Rig tracking: chest position, shoulder span scale, 3D quaternion rotation
 * - Live interactive garment settings: color, fit, and sleeve length
 */

export default function TryOnPage() {
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [fps, setFps] = useState(0);
  const [trackingStatus, setTrackingStatus] = useState<TrackingStatus>('idle');
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [inferenceStats, setInferenceStats] = useState<{ ms: number; delegate: 'GPU' | 'CPU' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Garment Configuration State
  const [garmentConfig, setGarmentConfig] = useState<GarmentConfig>({
    color: '#2563eb',
    size: 'regular',
    sleeveLength: 'short',
  });

  const handleStartCamera = useCallback(() => {
    setError(null);
    setIsStarting(true);
    setIsCameraActive(true);
  }, []);

  const handleStopCamera = useCallback(() => {
    setIsCameraActive(false);
    setIsStarting(false);
    setFps(0);
    setTrackingStatus('idle');
    setInferenceStats(null);
  }, []);

  const handleFpsUpdate = useCallback((newFps: number) => {
    setFps(newFps);
  }, []);

  const handleTrackingStatus = useCallback((status: TrackingStatus) => {
    setTrackingStatus(status);
  }, []);

  const handleInferenceStats = useCallback((ms: number, delegate: 'GPU' | 'CPU') => {
    setInferenceStats({ ms, delegate });
  }, []);

  const handleError = useCallback((message: string) => {
    setError(message);
    setIsCameraActive(false);
    setIsStarting(false);
    setTrackingStatus('idle');
    setInferenceStats(null);
  }, []);

  const handleCameraStateChange = useCallback((isActive: boolean) => {
    setIsStarting(false);
    if (!isActive && isCameraActive) {
      setIsCameraActive(false);
      setTrackingStatus('idle');
      setInferenceStats(null);
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

        {/* Status badges & Controls */}
        <div className="flex items-center gap-2.5">
          {/* Skeleton overlay toggle */}
          {isCameraActive && (
            <button
              onClick={() => setShowSkeleton((prev) => !prev)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-all cursor-pointer ${
                showSkeleton
                  ? 'bg-violet-500/15 border-violet-500/30 text-violet-300 hover:bg-violet-500/25'
                  : 'bg-white/[0.04] border-white/[0.08] text-white/40 hover:text-white/70'
              }`}
              title="Toggle 33-landmark skeleton overlay"
              id="btn-toggle-skeleton"
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
                {showSkeleton ? (
                  <>
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </>
                ) : (
                  <>
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </>
                )}
              </svg>
              <span>{showSkeleton ? 'Skeleton ON' : 'Skeleton OFF'}</span>
            </button>
          )}

          {/* Tracking status badge */}
          {isCameraActive && trackingStatus !== 'idle' && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-medium transition-colors duration-200 ${
                trackingStatus === 'active'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                  : trackingStatus === 'loading'
                  ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                  : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
              }`}
              id="tracking-status-badge"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  trackingStatus === 'active'
                    ? 'bg-emerald-400 animate-pulse'
                    : trackingStatus === 'loading'
                    ? 'bg-amber-400 animate-ping'
                    : 'bg-rose-400'
                }`}
              />
              <span>
                {trackingStatus === 'active'
                  ? 'Tracking (33 pts)'
                  : trackingStatus === 'loading'
                  ? 'Loading model...'
                  : 'No pose'}
              </span>
            </div>
          )}

          {/* ML Inference Latency badge */}
          {isCameraActive && inferenceStats && (
            <div
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-mono text-white/50"
              title={`Pose inference time: ${inferenceStats.ms}ms (${inferenceStats.delegate} delegate)`}
              id="inference-stats-badge"
            >
              <span className="text-violet-400 font-semibold">{inferenceStats.ms}ms</span>
              <span className="text-white/30 text-[10px]">({inferenceStats.delegate})</span>
            </div>
          )}

          {/* Live FPS counter */}
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
            showSkeleton={showSkeleton}
            garmentConfig={garmentConfig}
            onFpsUpdate={handleFpsUpdate}
            onError={handleError}
            onCameraStateChange={handleCameraStateChange}
            onTrackingStatus={handleTrackingStatus}
            onInferenceStats={handleInferenceStats}
          />
        </div>

        {/* Side panel — garment customization */}
        <aside className="w-72 shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex flex-col gap-6 overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-white/50">
              Garment Customizer
            </h2>
            <p className="text-[11px] text-white/30 mt-0.5">Procedural 3D T-shirt</p>
          </div>

          {/* Color Palette */}
          <div className="space-y-2.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-medium text-white/70">Fabric Color</label>
              <span className="text-[10px] font-mono text-white/40">{garmentConfig.color}</span>
            </div>
            <div className="grid grid-cols-4 gap-2.5">
              {[
                { hex: '#2563eb', name: 'Cobalt' },
                { hex: '#ef4444', name: 'Crimson' },
                { hex: '#10b981', name: 'Emerald' },
                { hex: '#8b5cf6', name: 'Violet' },
                { hex: '#d97706', name: 'Amber' },
                { hex: '#18181b', name: 'Stealth' },
                { hex: '#475569', name: 'Slate' },
                { hex: '#f8fafc', name: 'Ivory' },
              ].map(({ hex, name }) => (
                <button
                  key={hex}
                  onClick={() => setGarmentConfig((prev) => ({ ...prev, color: hex }))}
                  className={`group relative h-9 rounded-xl border flex items-center justify-center transition-all cursor-pointer ${
                    garmentConfig.color.toLowerCase() === hex.toLowerCase()
                      ? 'border-white ring-2 ring-violet-500/60 scale-105'
                      : 'border-white/10 hover:border-white/30 hover:scale-102'
                  }`}
                  style={{ backgroundColor: hex }}
                  title={name}
                  aria-label={`Select ${name} color`}
                >
                  {garmentConfig.color.toLowerCase() === hex.toLowerCase() && (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={hex === '#f8fafc' ? '#000000' : '#ffffff'}
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Fit / Sizing Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-medium text-white/70">Body Fit</label>
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
              {(['slim', 'regular', 'oversized'] as const).map((size) => (
                <button
                  key={size}
                  onClick={() => setGarmentConfig((prev) => ({ ...prev, size }))}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                    garmentConfig.size === size
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Sleeve Length Selector */}
          <div className="space-y-2.5">
            <label className="text-xs font-medium text-white/70">Sleeve Style</label>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-white/[0.04] border border-white/[0.06] rounded-xl">
              {(['short', 'medium'] as const).map((sleeve) => (
                <button
                  key={sleeve}
                  onClick={() => setGarmentConfig((prev) => ({ ...prev, sleeveLength: sleeve }))}
                  className={`py-1.5 rounded-lg text-xs font-medium capitalize transition-all cursor-pointer ${
                    garmentConfig.sleeveLength === sleeve
                      ? 'bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow'
                      : 'text-white/40 hover:text-white/80'
                  }`}
                >
                  {sleeve}
                </button>
              ))}
            </div>
          </div>

          {/* Live Torso Anchoring Status Card */}
          <div className="mt-auto p-3.5 rounded-xl border border-white/[0.06] bg-white/[0.02] flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-xs font-medium text-white/80">3D Torso Rig</span>
            </div>
            <p className="text-[11px] text-white/40 leading-relaxed">
              T-shirt dynamically anchors to shoulders & spine. Move closer/farther, lean, or rotate to test 3D tracking.
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

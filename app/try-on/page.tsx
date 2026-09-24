'use client';

import { useState } from 'react';
import TryOnCanvas from '@/components/TryOnCanvas';

/**
 * /try-on — the ONLY page in Milestone 1.
 *
 * Dark UI shell with full-viewport layout:
 * - TryOnCanvas (placeholder canvas area for camera + 3D rendering)
 * - Control bar with [Start Camera] / [Stop Camera] buttons (disabled for P0)
 */

export default function TryOnPage() {
  const [isCameraActive] = useState(false);

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

        {/* FPS counter placeholder — will be implemented in P7 */}
        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.06] text-[11px] text-white/30 font-mono">
            -- fps
          </div>
        </div>
      </header>

      {/* Main canvas area */}
      <main className="flex-1 flex gap-4 p-4 min-h-0">
        {/* Camera / 3D viewport */}
        <div className="flex-1 min-w-0">
          <TryOnCanvas isCameraActive={isCameraActive} />
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
              Controls will be enabled after camera + tracking are live
            </p>
          </div>
        </aside>
      </main>

      {/* Bottom control bar */}
      <footer className="px-6 py-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-center gap-3">
          {/* Start Camera button */}
          <button
            disabled
            className="
              flex items-center gap-2 px-5 py-2.5 rounded-xl
              bg-gradient-to-r from-violet-600 to-fuchsia-600
              text-sm font-medium
              opacity-50 cursor-not-allowed
              transition-all duration-200
            "
            id="btn-start-camera"
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
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Start Camera
          </button>

          {/* Stop Camera button */}
          <button
            disabled
            className="
              flex items-center gap-2 px-5 py-2.5 rounded-xl
              bg-white/[0.06] border border-white/[0.08]
              text-sm font-medium text-white/40
              opacity-50 cursor-not-allowed
              transition-all duration-200
            "
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

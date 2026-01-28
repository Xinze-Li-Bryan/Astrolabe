'use client'

/**
 * DevPanel - Performance metrics overlay for dev mode
 *
 * Shows:
 * - FPS counter with color-coded indicator
 * - Frame time breakdown (JS, physics, render)
 * - Three.js renderer stats (draw calls, triangles)
 * - Node/edge counts
 * - Stability status
 */

import { useState, useEffect } from 'react'
import { isDevMode, subscribeMetrics, type DevMetrics } from '@/lib/devMode'

interface DevPanelProps {
  className?: string
}

function getFpsColor(fps: number): string {
  if (fps >= 55) return '#22c55e' // green
  if (fps >= 30) return '#eab308' // yellow
  return '#ef4444' // red
}

function formatMs(ms: number): string {
  if (ms < 0.1) return '<0.1'
  if (ms < 1) return ms.toFixed(2)
  return ms.toFixed(1)
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export default function DevPanel({ className = '' }: DevPanelProps) {
  const [enabled, setEnabled] = useState(false)
  const [metrics, setMetrics] = useState<DevMetrics>({
    fps: 0,
    frameTime: 0,
    physicsTime: 0,
    renderTime: 0,
    jsTime: 0,
    nodeCount: 0,
    edgeCount: 0,
    stableFrames: 0,
    drawCalls: 0,
    triangles: 0,
    geometries: 0,
    textures: 0,
  })

  // Check dev mode on mount and listen for changes
  useEffect(() => {
    setEnabled(isDevMode())

    // Poll for dev mode changes (for console toggle)
    const pollInterval = setInterval(() => {
      setEnabled(isDevMode())
    }, 500)

    return () => clearInterval(pollInterval)
  }, [])

  // Subscribe to metrics updates
  useEffect(() => {
    if (!enabled) return

    const unsubscribe = subscribeMetrics(setMetrics)
    return unsubscribe
  }, [enabled])

  if (!enabled) return null

  const fpsColor = getFpsColor(metrics.fps)
  const isStable = metrics.stableFrames > 60

  // Calculate percentages for the bar
  const totalTime = metrics.frameTime || 1
  const physicsPercent = (metrics.physicsTime / totalTime) * 100
  const jsOtherPercent = ((metrics.jsTime - metrics.physicsTime) / totalTime) * 100
  const renderPercent = (metrics.renderTime / totalTime) * 100

  return (
    <div
      className={`font-mono text-[10px] leading-tight bg-black/80 text-white/90 p-2 rounded border border-white/10 select-none ${className}`}
      style={{ minWidth: 160 }}
    >
      {/* FPS Header */}
      <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-white/10">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: fpsColor }}
        />
        <span className="text-white font-semibold" style={{ fontSize: 14 }}>
          {metrics.fps}
        </span>
        <span className="text-white/50">FPS</span>
        {isStable && (
          <span className="ml-auto text-green-400/70 text-[9px]">STABLE</span>
        )}
      </div>

      {/* Timing Breakdown */}
      <div className="space-y-0.5">
        <div className="flex justify-between">
          <span className="text-white/50">Frame</span>
          <span>{formatMs(metrics.frameTime)} ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-cyan-400/70">├ JS total</span>
          <span className="text-cyan-400">{formatMs(metrics.jsTime)} ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-400/70">│ └ Physics</span>
          <span className="text-blue-400">{formatMs(metrics.physicsTime)} ms</span>
        </div>
        <div className="flex justify-between">
          <span className="text-purple-400/70">└ GPU render</span>
          <span className="text-purple-400">{formatMs(metrics.renderTime)} ms</span>
        </div>
      </div>

      {/* Visual Bar */}
      <div className="mt-1.5 h-1.5 bg-white/10 rounded overflow-hidden flex">
        <div
          className="h-full bg-blue-500"
          style={{ width: `${Math.min(100, physicsPercent)}%` }}
          title="Physics"
        />
        <div
          className="h-full bg-cyan-500"
          style={{ width: `${Math.min(100, Math.max(0, jsOtherPercent))}%` }}
          title="JS Other"
        />
        <div
          className="h-full bg-purple-500"
          style={{ width: `${Math.min(100, renderPercent)}%` }}
          title="GPU Render"
        />
      </div>

      {/* Renderer Stats */}
      <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-0.5 text-white/50">
        <div className="flex justify-between">
          <span>Draw calls</span>
          <span className="text-white/70">{metrics.drawCalls}</span>
        </div>
        <div className="flex justify-between">
          <span>Triangles</span>
          <span className="text-white/70">{formatNumber(metrics.triangles)}</span>
        </div>
        <div className="flex justify-between">
          <span>Geometries</span>
          <span className="text-white/70">{metrics.geometries}</span>
        </div>
      </div>

      {/* Node/Edge Stats */}
      <div className="mt-1.5 pt-1.5 border-t border-white/10 flex justify-between text-white/40">
        <span>{metrics.nodeCount} nodes</span>
        <span>{metrics.edgeCount} edges</span>
      </div>
    </div>
  )
}

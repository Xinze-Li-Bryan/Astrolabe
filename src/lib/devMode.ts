/**
 * Dev Mode Configuration
 *
 * Toggle via:
 * - Environment variable: NEXT_PUBLIC_DEV_MODE=true
 * - Console: window.__ASTROLABE_DEV__ = true (or Astrolabe.devMode(true))
 * - Console: Astrolabe.devMode() to toggle
 */

export interface DevMetrics {
  fps: number
  frameTime: number      // ms between frames (actual frame-to-frame)
  physicsTime: number    // ms for physics simulation (JS)
  renderTime: number     // ms for GPU render (estimated)
  jsTime: number         // ms for JS in useFrame
  nodeCount: number
  edgeCount: number
  stableFrames: number
  // Three.js renderer stats
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
}

// Global state for dev mode
let devModeEnabled = typeof window !== 'undefined'
  ? (process.env.NEXT_PUBLIC_DEV_MODE === 'true' || (window as any).__ASTROLABE_DEV__ === true)
  : false

// Metrics storage
const metrics: DevMetrics = {
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
}

// Frame-to-frame timing (actual render cycle)
let lastFrameTime = 0
let frameTimes: number[] = []
let physicsTimes: number[] = []
let jsTimes: number[] = []

// Listeners for metrics updates
type MetricsListener = (metrics: DevMetrics) => void
const listeners = new Set<MetricsListener>()

export function isDevMode(): boolean {
  if (typeof window !== 'undefined') {
    // Check runtime toggle
    if ((window as any).__ASTROLABE_DEV__ !== undefined) {
      return (window as any).__ASTROLABE_DEV__ === true
    }
  }
  return devModeEnabled
}

export function setDevMode(enabled: boolean): void {
  devModeEnabled = enabled
  if (typeof window !== 'undefined') {
    (window as any).__ASTROLABE_DEV__ = enabled
  }
  console.log(`[DevMode] ${enabled ? 'Enabled' : 'Disabled'}`)
}

export function toggleDevMode(): boolean {
  const newState = !isDevMode()
  setDevMode(newState)
  return newState
}

export function getMetrics(): DevMetrics {
  return { ...metrics }
}

export function subscribeMetrics(listener: MetricsListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function notifyListeners(): void {
  const snapshot = { ...metrics }
  listeners.forEach(listener => listener(snapshot))
}

// Called every frame to update timing
export function recordFrameStart(): number {
  return performance.now()
}

export function recordPhysicsTime(startTime: number): void {
  const elapsed = performance.now() - startTime
  physicsTimes.push(elapsed)
  if (physicsTimes.length > 30) physicsTimes.shift()
  metrics.physicsTime = physicsTimes.reduce((a, b) => a + b, 0) / physicsTimes.length
}

export function recordFrameEnd(frameStartTime: number): void {
  const now = performance.now()

  // JS time in useFrame callback
  const jsTime = now - frameStartTime
  jsTimes.push(jsTime)
  if (jsTimes.length > 30) jsTimes.shift()
  metrics.jsTime = jsTimes.reduce((a, b) => a + b, 0) / jsTimes.length

  // Frame-to-frame timing (includes GPU render)
  if (lastFrameTime > 0) {
    const frameTime = now - lastFrameTime
    frameTimes.push(frameTime)
    if (frameTimes.length > 30) frameTimes.shift()

    // Smoothed frame time
    metrics.frameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length

    // Estimate render time = frame time - JS time
    metrics.renderTime = Math.max(0, metrics.frameTime - metrics.jsTime)

    // Calculate FPS from frame time
    metrics.fps = Math.round(1000 / metrics.frameTime)
  }
  lastFrameTime = now

  // Notify every ~16 frames for smoother updates
  if (frameTimes.length % 8 === 0) {
    notifyListeners()
  }
}

export function updateNodeEdgeCount(nodeCount: number, edgeCount: number): void {
  metrics.nodeCount = nodeCount
  metrics.edgeCount = edgeCount
}

export function updateStableFrames(count: number): void {
  metrics.stableFrames = count
}

export function updateRendererInfo(info: {
  drawCalls?: number
  triangles?: number
  geometries?: number
  textures?: number
}): void {
  if (info.drawCalls !== undefined) metrics.drawCalls = info.drawCalls
  if (info.triangles !== undefined) metrics.triangles = info.triangles
  if (info.geometries !== undefined) metrics.geometries = info.geometries
  if (info.textures !== undefined) metrics.textures = info.textures
}

// Console API
if (typeof window !== 'undefined') {
  (window as any).Astrolabe = {
    devMode: (enabled?: boolean) => {
      if (enabled === undefined) {
        return toggleDevMode()
      }
      setDevMode(enabled)
      return enabled
    },
    getMetrics,
    help: () => {
      console.log(`
Astrolabe Dev Console Commands:
  Astrolabe.devMode()       - Toggle dev mode (FPS panel)
  Astrolabe.devMode(true)   - Enable dev mode
  Astrolabe.devMode(false)  - Disable dev mode
  Astrolabe.getMetrics()    - Get current performance metrics
      `)
    }
  }

  // Log help on first load if dev mode is enabled
  if (isDevMode()) {
    console.log('[DevMode] Enabled. Type Astrolabe.help() for commands.')
  }
}

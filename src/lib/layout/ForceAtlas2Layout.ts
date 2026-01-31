/**
 * ForceAtlas2 Layout with Web Worker Support
 *
 * Uses graphology-layout-forceatlas2's built-in Web Worker
 * to run physics calculations off the main thread.
 *
 * Features:
 * - O(n log n) Barnes-Hut approximation for large graphs
 * - Automatic parameter inference based on graph size
 * - Position sync callback for rendering updates
 */

import Graph from 'graphology'
import FA2Layout from 'graphology-layout-forceatlas2/worker'
import { inferSettings } from 'graphology-layout-forceatlas2'
import type { Node, Edge } from '@/lib/store'

export interface FA2Settings {
  gravity: number
  scalingRatio: number
  barnesHutOptimize: boolean
  barnesHutTheta: number
  strongGravityMode: boolean
  adjustSizes: boolean
  linLogMode: boolean
  outboundAttractionDistribution: boolean
  edgeWeightInfluence: number
  slowDown: number
}

export type PositionUpdateCallback = (
  positions: Map<string, [number, number, number]>
) => void

/**
 * ForceAtlas2 layout engine with Web Worker support
 */
export class ForceAtlas2Layout {
  private graph: Graph
  private layout: InstanceType<typeof FA2Layout> | null = null
  private onUpdate: PositionUpdateCallback | null
  private inferredSettings: Partial<FA2Settings> = {}
  private currentSettings: Partial<FA2Settings> = {}
  private animationFrameId: number | null = null

  constructor(onUpdate?: PositionUpdateCallback) {
    this.graph = new Graph()
    this.onUpdate = onUpdate || null
  }

  /**
   * Initialize the graph with nodes and edges
   */
  init(nodes: Node[], edges: Edge[]): void {
    this.graph.clear()

    // Add nodes with Fibonacci sphere initial positions
    const nodeCount = nodes.length
    nodes.forEach((node, i) => {
      // Fibonacci sphere distribution for even spread
      const goldenAngle = Math.PI * (3 - Math.sqrt(5))
      const theta = i * goldenAngle
      const phi = Math.acos(1 - (2 * (i + 0.5)) / nodeCount)

      // Project to 2D with some spread
      const radius = 100 * Math.sqrt(nodeCount / 10)
      const x = radius * Math.sin(phi) * Math.cos(theta)
      const y = radius * Math.sin(phi) * Math.sin(theta)

      this.graph.addNode(node.id, {
        x,
        y,
        size: node.defaultSize || 1,
        label: node.name,
      })
    })

    // Add edges (skip if source or target doesn't exist)
    edges.forEach((edge) => {
      if (this.graph.hasNode(edge.source) && this.graph.hasNode(edge.target)) {
        try {
          this.graph.addEdge(edge.source, edge.target, {
            weight: 1,
          })
        } catch {
          // Edge might already exist (multigraph handling)
        }
      }
    })

    // Pre-compute inferred settings
    this.inferredSettings = inferSettings(this.graph)
  }

  /**
   * Get the underlying graphology graph
   */
  getGraph(): Graph {
    return this.graph
  }

  /**
   * Get settings inferred from graph structure
   */
  getInferredSettings(): Partial<FA2Settings> {
    return { ...this.inferredSettings }
  }

  /**
   * Get current active settings
   */
  getCurrentSettings(): Partial<FA2Settings> {
    return { ...this.currentSettings }
  }

  /**
   * Start the layout computation in a Web Worker
   */
  start(customSettings?: Partial<FA2Settings>): void {
    if (this.layout) {
      this.layout.kill()
    }

    // Merge settings: defaults < inferred < custom
    const defaultSettings: Partial<FA2Settings> = {
      gravity: 1,
      scalingRatio: 2,
      barnesHutOptimize: this.graph.order > 100, // Enable for large graphs
      barnesHutTheta: 0.5,
      strongGravityMode: false,
      adjustSizes: false,
      linLogMode: false,
      outboundAttractionDistribution: false,
      edgeWeightInfluence: 1,
      slowDown: 1,
    }

    this.currentSettings = {
      ...defaultSettings,
      ...this.inferredSettings,
      ...customSettings,
    }

    this.layout = new FA2Layout(this.graph, {
      settings: this.currentSettings,
    })

    this.layout.start()
    this.startPositionSync()
  }

  /**
   * Stop the layout computation (can be resumed)
   */
  stop(): void {
    this.layout?.stop()
    this.stopPositionSync()
  }

  /**
   * Kill the layout and release resources
   */
  kill(): void {
    this.layout?.kill()
    this.layout = null
    this.stopPositionSync()
  }

  /**
   * Check if layout is currently running
   */
  isRunning(): boolean {
    return this.layout?.isRunning() ?? false
  }

  /**
   * Manually trigger a position sync (for testing)
   */
  syncPositions(): void {
    if (!this.onUpdate) return

    const positions = new Map<string, [number, number, number]>()
    this.graph.forEachNode((id, attrs) => {
      positions.set(id, [attrs.x || 0, attrs.y || 0, 0])
    })

    this.onUpdate(positions)
  }

  /**
   * Start the position sync loop using requestAnimationFrame
   */
  private startPositionSync(): void {
    if (!this.onUpdate) return

    const sync = () => {
      if (!this.layout?.isRunning()) {
        this.animationFrameId = null
        return
      }

      this.syncPositions()
      this.animationFrameId = requestAnimationFrame(sync)
    }

    sync()
  }

  /**
   * Stop the position sync loop
   */
  private stopPositionSync(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId)
      this.animationFrameId = null
    }
  }
}

export default ForceAtlas2Layout

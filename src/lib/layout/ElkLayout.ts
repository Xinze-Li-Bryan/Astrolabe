/**
 * ELK Layout for DAG/Dependency Graph Visualization
 *
 * Optimized configuration for layered layout of directed acyclic graphs.
 * Uses the ELK (Eclipse Layout Kernel) library for high-quality layouts.
 *
 * Key features:
 * - Model order strategy to leverage Lean namespace ordering
 * - Optimized crossing minimization
 * - Configurable direction and spacing
 */

import ELK from 'elkjs/lib/elk.bundled'
import type { Node, Edge } from '@/lib/store'

export interface ElkLayoutOptions {
  /** Layout direction: 'DOWN' (default), 'UP', 'LEFT', 'RIGHT' */
  direction?: 'DOWN' | 'UP' | 'LEFT' | 'RIGHT'
  /** Spacing between nodes in the same layer */
  nodeSpacing?: number
  /** Spacing between layers */
  layerSpacing?: number
  /** Node width for layout calculation */
  nodeWidth?: number
  /** Node height for layout calculation */
  nodeHeight?: number
  /** Use model order to reduce crossings (leverages natural ordering) */
  useModelOrder?: boolean
  /** Center the output around origin */
  centerOutput?: boolean
}

const DEFAULT_OPTIONS: Required<ElkLayoutOptions> = {
  direction: 'DOWN',
  nodeSpacing: 50,
  layerSpacing: 80,
  nodeWidth: 30,
  nodeHeight: 30,
  useModelOrder: true,
  centerOutput: true,
}

/**
 * ELK-based layout engine optimized for DAGs
 */
export class ElkLayout {
  private elk: InstanceType<typeof ELK>
  private options: Required<ElkLayoutOptions>

  constructor(options?: ElkLayoutOptions) {
    this.elk = new ELK()
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /**
   * Compute layout positions for all nodes
   */
  async compute(
    nodes: Node[],
    edges: Edge[]
  ): Promise<Map<string, [number, number, number]>> {
    const nodeIds = new Set(nodes.map((n) => n.id))

    // Build ELK graph structure
    const elkGraph = {
      id: 'root',
      layoutOptions: this.buildLayoutOptions(),
      children: nodes.map((n) => ({
        id: n.id,
        width: this.options.nodeWidth,
        height: this.options.nodeHeight,
      })),
      edges: edges
        .filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))
        .map((e) => ({
          id: e.id,
          sources: [e.source],
          targets: [e.target],
        })),
    }

    // Compute layout
    const result = await this.elk.layout(elkGraph)

    // Extract positions
    const positions = new Map<string, [number, number, number]>()
    for (const child of result.children || []) {
      positions.set(child.id, [child.x || 0, child.y || 0, 0])
    }

    // Center if requested
    if (this.options.centerOutput && positions.size > 0) {
      this.centerPositions(positions)
    }

    return positions
  }

  /**
   * Build ELK layout options from config
   */
  private buildLayoutOptions(): Record<string, string> {
    const opts: Record<string, string> = {
      'elk.algorithm': 'layered',
      'elk.direction': this.options.direction,
      'elk.spacing.nodeNode': String(this.options.nodeSpacing),
      'elk.layered.spacing.nodeNodeBetweenLayers': String(this.options.layerSpacing),
      'elk.layered.spacing.edgeNodeBetweenLayers': String(this.options.layerSpacing / 2),
      // Crossing minimization
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      // Node placement
      'elk.layered.nodePlacement.strategy': 'NETWORK_SIMPLEX',
      // Compaction
      'elk.layered.compaction.postCompaction.strategy': 'EDGE_LENGTH',
    }

    // Use model order to leverage natural namespace ordering
    if (this.options.useModelOrder) {
      opts['elk.layered.considerModelOrder.strategy'] = 'NODES_AND_EDGES'
    }

    return opts
  }

  /**
   * Center positions around origin
   */
  private centerPositions(positions: Map<string, [number, number, number]>): void {
    let cx = 0,
      cy = 0
    for (const pos of positions.values()) {
      cx += pos[0]
      cy += pos[1]
    }
    cx /= positions.size
    cy /= positions.size

    for (const [id, pos] of positions.entries()) {
      positions.set(id, [pos[0] - cx, pos[1] - cy, pos[2]])
    }
  }
}

export default ElkLayout

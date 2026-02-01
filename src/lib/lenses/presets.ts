/**
 * Built-in Lens Presets
 *
 * These are the default lenses that ship with Astrolabe.
 * The format is designed to be extensible - in the future,
 * users could define their own lenses in ~/.astrolabe/lenses.yaml
 */

import type { Lens } from './types'

export const LENSES: Lens[] = [
  // ============================================
  // Canvas Mode - Interactive exploration
  // ============================================
  {
    id: 'canvas',
    name: 'Canvas',
    description: 'Interactive exploration: search, add nodes, expand neighbors',
    icon: 'pencil-square',
    requiresFocus: false,
    layout: 'force',
    filterId: null,
    aggregateId: null,
  },

  // ============================================
  // Full Graph - Show everything
  // ============================================
  {
    id: 'full',
    name: 'Full Graph',
    description: 'All nodes and edges, force-directed layout',
    icon: 'network',
    requiresFocus: false,
    recommendedWhen: {
      maxNodes: 300,
    },
    layout: 'force',
    filterId: null,       // no filtering
    aggregateId: null,    // no aggregation
  },

  // ============================================
  // Namespaces - Group by namespace (Phase 3)
  // ============================================
  {
    id: 'namespaces',
    name: 'Namespaces',
    description: 'Nodes grouped by namespace into expandable clusters',
    icon: 'boxes',
    requiresFocus: false,
    recommendedWhen: {
      minNodes: 300,
    },
    layout: 'force',
    filterId: null,
    aggregateId: 'byNamespace',
    settings: [
      { key: 'namespaceDepth', label: 'Depth', type: 'slider', min: 1, max: 4 },
      // collapseThreshold removed - always collapse all namespaces into bubbles
    ],
  },

  // ============================================
  // Ego Network - N-hop from focus (Phase 2)
  // ============================================
  {
    id: 'ego',
    name: 'Ego Network',
    description: 'N-hop neighborhood centered on selected node',
    icon: 'target',
    requiresFocus: true,
    layout: 'radial',
    filterId: 'nHop',
    aggregateId: null,
    settings: [
      { key: 'nHop', label: 'Hops', type: 'slider', min: 1, max: 5 },
    ],
  },

  // ============================================
  // Import Tree - What does X depend on? (Phase 4)
  // ============================================
  {
    id: 'imports',
    name: 'Import Tree',
    description: 'Dependencies of the selected node (what it uses)',
    icon: 'arrow-down',
    requiresFocus: true,
    layout: 'hierarchical',
    filterId: 'ancestors',       // to be implemented in Phase 4
    aggregateId: 'byNamespace',
  },

  // ============================================
  // Dependents - What depends on X? (Phase 4)
  // ============================================
  {
    id: 'dependents',
    name: 'Dependents',
    description: 'What depends on the selected node (what uses it)',
    icon: 'arrow-up',
    requiresFocus: true,
    layout: 'hierarchical',
    filterId: 'descendants',     // to be implemented in Phase 4
    aggregateId: 'byNamespace',
  },
]

// Quick lookup by ID
export const LENSES_BY_ID = new Map(LENSES.map(lens => [lens.id, lens]))

// Get the default lens ID
export const DEFAULT_LENS_ID = 'canvas'

/**
 * Get recommended lens based on node count
 */
export function getRecommendedLens(nodeCount: number): Lens {
  // Find a lens that matches the node count criteria
  for (const lens of LENSES) {
    const { recommendedWhen } = lens
    if (!recommendedWhen) continue

    const { minNodes, maxNodes } = recommendedWhen
    const meetsMin = minNodes === undefined || nodeCount >= minNodes
    const meetsMax = maxNodes === undefined || nodeCount <= maxNodes

    if (meetsMin && meetsMax) {
      return lens
    }
  }

  // Fallback to full
  return LENSES_BY_ID.get('full')!
}

/**
 * Check if a lens is available (all required features implemented)
 */
export function isLensAvailable(lensId: string): boolean {
  // 'canvas' - Interactive exploration mode
  // Phase 1: 'full' lens
  // Phase 2: 'ego' lens (nHop filter implemented)
  // Phase 3: 'namespaces' lens (byNamespace aggregator implemented)
  // Phase 4: 'imports'/'dependents' lenses (ancestors/descendants filters implemented)
  const available = ['canvas', 'full', 'ego', 'namespaces', 'imports', 'dependents']
  return available.includes(lensId)
}

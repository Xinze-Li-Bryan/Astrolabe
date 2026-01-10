/**
 * Unified proof status configuration
 * Used for consistent rendering of Monaco Editor glyph icons and 3D node status rings
 */

export const PROOF_STATUS_CONFIG = {
  proven: {
    color: '#00F5D4',     // Cyan jade
    symbol: '🜲',
    label: 'Verified',
    ring: { type: 'full' as const, animated: false, glow: true }
  },
  sorry: {
    color: '#F4D35E',     // Golden amber
    symbol: '⚝',
    label: 'Contains sorry',
    ring: { type: 'dashed' as const, animated: true, speed: 0.5 }
  },
  error: {
    color: '#EF476F',     // Vermillion red
    symbol: '☾',
    label: 'Has errors',
    ring: { type: 'arc' as const, animated: true, speed: 0.8, arcLength: Math.PI }  // Rotating half-ring
  },
  stated: {
    color: '#888888',
    symbol: null,
    label: 'Stated',
    ring: null
  },
  loading: {
    color: '#888888',
    symbol: '⟳',
    label: 'Loading',
    ring: { type: 'loading' as const, animated: true, speed: 2 }
  },
  unknown: {
    color: '#95a5a6',
    symbol: null,
    label: 'Unknown',
    ring: null
  }
} as const

export type ProofStatusType = keyof typeof PROOF_STATUS_CONFIG

export type RingType = 'full' | 'dashed' | 'arc' | 'loading'

export interface RingConfig {
  type: RingType
  animated: boolean
  glow?: boolean
  speed?: number
  arcLength?: number
}

/**
 * Get status configuration
 */
export function getStatusConfig(status: ProofStatusType) {
  return PROOF_STATUS_CONFIG[status] ?? PROOF_STATUS_CONFIG.unknown
}

/**
 * Get status color
 */
export function getStatusColor(status: ProofStatusType): string {
  return getStatusConfig(status).color
}

/**
 * Get status ring configuration
 */
export function getStatusRingConfig(status: ProofStatusType): RingConfig | null {
  return getStatusConfig(status).ring as RingConfig | null
}

/**
 * Calculate edge color based on status of two endpoint nodes
 * Priority: error > sorry > proven
 * @param sourceStatus Source node status
 * @param targetStatus Target node status
 * @param isFromLean Whether it's from Lean code (not a custom edge)
 * @returns Edge color
 */
export function getEdgeColorByNodeStatus(
  sourceStatus: ProofStatusType | undefined,
  targetStatus: ProofStatusType | undefined,
  isFromLean: boolean
): string | null {
  // Custom edges return null, use default gray
  if (!isFromLean) return null

  // If either node has no status, return null to use default color
  if (!sourceStatus || !targetStatus) return null

  // If either node is unknown or stated, don't color
  if (sourceStatus === 'unknown' || sourceStatus === 'stated') return null
  if (targetStatus === 'unknown' || targetStatus === 'stated') return null

  // Priority: error > sorry > proven
  if (sourceStatus === 'error' || targetStatus === 'error') {
    return PROOF_STATUS_CONFIG.error.color
  }
  if (sourceStatus === 'sorry' || targetStatus === 'sorry') {
    return PROOF_STATUS_CONFIG.sorry.color
  }
  if (sourceStatus === 'proven' && targetStatus === 'proven') {
    return PROOF_STATUS_CONFIG.proven.color
  }

  return null
}

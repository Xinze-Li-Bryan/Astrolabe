/**
 * Interaction layer visual styles
 *
 * Used for visual representation of interaction states like selection, highlighting, focus
 * Separated from rendering layer (themes) to maintain consistent interaction experience
 */

export const INTERACTION_STYLES = {
  '2d': {
    node: {
      selected: {
        strokeColor: '#ffffff',
        glowRadius: 4,
        glowColor: 'rgba(255, 255, 255, 0.2)',
        scale: 1.3,
      },
      hovered: {
        scale: 1.1,
      },
      dimmed: {
        opacity: 0.3,
      },
    },
    edge: {
      selected: {
        color: '#ffffff',
        width: 3,
      },
      input: {
        color: '#00d4ff',  // Blue - edges pointing to current node
        width: 2,
      },
      output: {
        color: '#ff6b35',  // Orange - edges from current node
        width: 2,
      },
      normal: {
        color: 'rgba(255, 255, 255, 0.15)',
        width: 1,
      },
      dimmed: {
        opacity: 0.1,
      },
    },
    camera: {
      focusDuration: 500,
      focusEase: 'cubicOut',
    },
  },
  '3d': {
    node: {
      selected: {
        emissive: '#ffffff',
        emissiveIntensity: 0.5,
        scale: 1.2,
      },
      hovered: {
        emissiveIntensity: 0.3,
      },
      dimmed: {
        opacity: 0.3,
      },
    },
    edge: {
      selected: {
        color: '#ffffff',
        width: 4,
        glow: true,
      },
      input: {
        color: '#00d4ff',  // Blue - edges pointing to current node
        width: 3,
      },
      output: {
        color: '#ff6b35',  // Orange - edges from current node
        width: 3,
      },
      normal: {
        opacity: 0.6,
      },
      dimmed: {
        opacity: 0.1,
      },
    },
    camera: {
      focusDistance: 50,
      focusDuration: 500,
    },
  },
} as const

export type ViewMode = '2d' | '3d'
export type InteractionStyles = typeof INTERACTION_STYLES

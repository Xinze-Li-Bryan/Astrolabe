/**
 * Undoable Viewport Actions
 *
 * Wraps viewport mutations (filter options, physics settings, etc.) to make them undoable.
 */

import { undoable } from './withUndo'
import { updateViewport } from '@/lib/api'
import type { FilterOptionsData, PhysicsSettingsData } from '@/lib/api'

/**
 * Filter options type that matches GraphFilterOptions (with optional transitiveReduction)
 */
export interface FilterOptions {
  hideTechnical: boolean
  hideOrphaned: boolean
  transitiveReduction?: boolean
}

/**
 * Convert FilterOptions to FilterOptionsData (with defaults)
 */
function toFilterOptionsData(options: FilterOptions): FilterOptionsData {
  return {
    hideTechnical: options.hideTechnical,
    hideOrphaned: options.hideOrphaned,
    transitiveReduction: options.transitiveReduction ?? true,
  }
}

/**
 * Generate a human-readable label for filter option changes
 */
function getFilterChangeLabel(
  newOptions: FilterOptions,
  oldOptions: FilterOptions
): string {
  const changes: string[] = []

  if (newOptions.hideTechnical !== oldOptions.hideTechnical) {
    changes.push(newOptions.hideTechnical ? 'Hide Technical: on' : 'Hide Technical: off')
  }
  if (newOptions.hideOrphaned !== oldOptions.hideOrphaned) {
    changes.push(newOptions.hideOrphaned ? 'Hide Orphaned: on' : 'Hide Orphaned: off')
  }
  if ((newOptions.transitiveReduction ?? true) !== (oldOptions.transitiveReduction ?? true)) {
    changes.push(newOptions.transitiveReduction ? 'Transitive Reduction: on' : 'Transitive Reduction: off')
  }

  if (changes.length === 0) {
    return 'Update filter options'
  } else if (changes.length === 1) {
    return changes[0]
  } else {
    return `Update ${changes.length} filter options`
  }
}

/**
 * Undoable filter options update
 *
 * @param projectPath - Project path
 * @param newOptions - New filter options
 * @param oldOptions - Previous filter options (for undo)
 * @param setFilterOptions - Callback to update local state
 */
export async function updateFilterOptionsUndoable(
  projectPath: string,
  newOptions: FilterOptions,
  oldOptions: FilterOptions,
  setFilterOptions: (options: FilterOptions) => void
): Promise<void> {
  const label = getFilterChangeLabel(newOptions, oldOptions)

  await undoable(
    'viewport',
    label,
    // Do: apply new options
    async () => {
      setFilterOptions(newOptions)
      await updateViewport(projectPath, { filter_options: toFilterOptionsData(newOptions) })
    },
    // Undo: restore old options
    async () => {
      setFilterOptions(oldOptions)
      await updateViewport(projectPath, { filter_options: toFilterOptionsData(oldOptions) })
    }
  )
}

/**
 * Physics parameter names for labels
 */
const PHYSICS_PARAM_LABELS: Record<string, string> = {
  clusteringEnabled: 'Namespace Clustering',
  clusteringStrength: 'Clustering Strength',
  clusterSeparation: 'Cluster Separation',
  clusteringDepth: 'Clustering Depth',
  adaptiveSpringEnabled: 'Adaptive Spring',
  adaptiveSpringMode: 'Adaptive Mode',
  adaptiveSpringScale: 'Adaptive Scale',
  repulsionStrength: 'Repulsion',
  springLength: 'Spring Length',
  springStrength: 'Spring Strength',
  centerStrength: 'Center Strength',
  damping: 'Damping',
}

/**
 * Physics params interface (matches PhysicsParams from ForceLayout)
 */
export interface PhysicsParams {
  repulsionStrength: number
  springLength: number
  springStrength: number
  centerStrength: number
  damping: number
  clusteringEnabled: boolean
  clusteringStrength: number
  clusterSeparation: number
  clusteringDepth: number
  adaptiveSpringEnabled: boolean
  adaptiveSpringMode: 'sqrt' | 'logarithmic' | 'linear'
  adaptiveSpringScale: number
  // Community-aware layout
  communityAwareLayout: boolean
  communitySameMultiplier: number
  communityCrossMultiplier: number
  // Community clustering (direct forces)
  communityClusteringStrength: number
  communitySeparation: number
  // Boundary constraint
  boundaryRadius: number
  boundaryStrength: number
}

/**
 * Generate label for physics change
 */
function getPhysicsChangeLabel(
  newPhysics: PhysicsParams,
  oldPhysics: PhysicsParams
): string {
  const changes: string[] = []

  for (const key of Object.keys(newPhysics) as (keyof PhysicsParams)[]) {
    if (newPhysics[key] !== oldPhysics[key]) {
      const label = PHYSICS_PARAM_LABELS[key] || key
      const value = newPhysics[key]
      if (typeof value === 'boolean') {
        changes.push(`${label}: ${value ? 'on' : 'off'}`)
      } else {
        changes.push(`${label}: ${value}`)
      }
    }
  }

  if (changes.length === 0) {
    return 'Update physics'
  } else if (changes.length === 1) {
    return changes[0]
  } else {
    return `Update ${changes.length} physics settings`
  }
}

/**
 * Convert physics params to API format
 */
function toPhysicsSettingsData(physics: PhysicsParams): PhysicsSettingsData {
  return {
    repulsionStrength: physics.repulsionStrength,
    springLength: physics.springLength,
    springStrength: physics.springStrength,
    centerStrength: physics.centerStrength,
    damping: physics.damping,
    clusteringEnabled: physics.clusteringEnabled,
    clusteringStrength: physics.clusteringStrength,
    clusterSeparation: physics.clusterSeparation,
    clusteringDepth: physics.clusteringDepth,
    adaptiveSpringEnabled: physics.adaptiveSpringEnabled,
    adaptiveSpringMode: physics.adaptiveSpringMode,
    adaptiveSpringScale: physics.adaptiveSpringScale,
  }
}

/**
 * Undoable physics settings update (persisted to backend)
 *
 * @param projectPath - Project path
 * @param newPhysics - New physics settings
 * @param oldPhysics - Previous physics settings (for undo)
 * @param setPhysics - Callback to update local state
 */
export async function updatePhysicsUndoable(
  projectPath: string,
  newPhysics: PhysicsParams,
  oldPhysics: PhysicsParams,
  setPhysics: (physics: PhysicsParams) => void
): Promise<void> {
  const label = getPhysicsChangeLabel(newPhysics, oldPhysics)

  await undoable(
    'viewport',
    label,
    // Do: apply new physics
    async () => {
      setPhysics(newPhysics)
      await updateViewport(projectPath, { physics_settings: toPhysicsSettingsData(newPhysics) })
    },
    // Undo: restore old physics
    async () => {
      setPhysics(oldPhysics)
      await updateViewport(projectPath, { physics_settings: toPhysicsSettingsData(oldPhysics) })
    }
  )
}

/**
 * Viewport actions namespace for easy importing
 */
export const viewportActions = {
  updateFilterOptions: updateFilterOptionsUndoable,
  updatePhysics: updatePhysicsUndoable,
}

export default viewportActions

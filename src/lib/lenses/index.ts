/**
 * Lens System
 *
 * Re-exports all lens-related types and functions
 */

// Types
export type {
  Node,
  Edge,
  Lens,
  LensLayout,
  LensFilter,
  LensAggregate,
  LensFilterContext,
  LensAggregateContext,
  LensOptions,
  LensPipelineResult,
  LensActivationState,
  LensState,
  NamespaceGroup,
  AggregateResult,
} from './types'

export { DEFAULT_LENS_OPTIONS } from './types'

// Presets
export {
  LENSES,
  LENSES_BY_ID,
  DEFAULT_LENS_ID,
  getRecommendedLens,
  isLensAvailable,
} from './presets'

// Pipeline
export {
  applyLens,
  registerFilter,
  registerAggregator,
  isLensImplemented,
  getImplementedLenses,
} from './pipeline'

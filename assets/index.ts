import type {
  ViewType,
  NodeShape3DProps,
  NodeShape2DConfig,
  EdgeStyle3DProps,
  EdgeStyle2DConfig,
  NodeEffectProps,
  EdgeEffectProps,
  EffectMeta,
} from './types'

export type {
  ViewType,
  NodeShape3DProps,
  NodeShape2DConfig,
  EdgeStyle3DProps,
  EdgeStyle2DConfig,
  NodeEffectProps,
  EdgeEffectProps,
  EffectMeta,
}

// ============ Node Shapes 3D ============
import { Sphere3D, Sphere2D } from './nodes/shapes/Sphere'
import { Box3D, Box2D } from './nodes/shapes/Box'
import { Octahedron3D, Octahedron2D } from './nodes/shapes/Octahedron'
import { Tetrahedron3D, Tetrahedron2D } from './nodes/shapes/Tetrahedron'
import { Dodecahedron3D, Dodecahedron2D } from './nodes/shapes/Dodecahedron'
import { Icosahedron3D, Icosahedron2D } from './nodes/shapes/Icosahedron'
import { Cone3D, Cone2D } from './nodes/shapes/Cone'
import { Cylinder3D, Cylinder2D } from './nodes/shapes/Cylinder'
import { Torus3D, Torus2D } from './nodes/shapes/Torus'
import { TorusKnot3D, TorusKnot2D } from './nodes/shapes/TorusKnot'
import { Ring3D, Ring2D } from './nodes/shapes/Ring'
import { Capsule3D, Capsule2D } from './nodes/shapes/Capsule'

export const NODE_SHAPES_3D: Record<string, React.ComponentType<NodeShape3DProps>> = {
  sphere: Sphere3D,
  box: Box3D,
  octahedron: Octahedron3D,
  tetrahedron: Tetrahedron3D,
  dodecahedron: Dodecahedron3D,
  icosahedron: Icosahedron3D,
  cone: Cone3D,
  cylinder: Cylinder3D,
  torus: Torus3D,
  torusKnot: TorusKnot3D,
  ring: Ring3D,
  capsule: Capsule3D,
}

export const NODE_SHAPES_2D: Record<string, (props: NodeShape3DProps) => NodeShape2DConfig> = {
  sphere: Sphere2D,
  box: Box2D,
  octahedron: Octahedron2D,
  tetrahedron: Tetrahedron2D,
  dodecahedron: Dodecahedron2D,
  icosahedron: Icosahedron2D,
  cone: Cone2D,
  cylinder: Cylinder2D,
  torus: Torus2D,
  torusKnot: TorusKnot2D,
  ring: Ring2D,
  capsule: Capsule2D,
}

// ============ Edge Styles 3D ============
import { Solid3D, Solid2D } from './edges/Solid'
import { Dashed3D, Dashed2D } from './edges/Dashed'
import { Dotted3D, Dotted2D } from './edges/Dotted'
import { Wavy3D, Wavy2D } from './edges/Wavy'
import { Zigzag3D, Zigzag2D } from './edges/Zigzag'
import { Spring3D, Spring2D } from './edges/Spring'

// Export edge style components directly
export { Wavy3D, Zigzag3D, Spring3D }

export const EDGE_STYLES_3D: Record<string, React.ComponentType<EdgeStyle3DProps>> = {
  solid: Solid3D,
  dashed: Dashed3D,
  dotted: Dotted3D,
  wavy: Wavy3D,
  zigzag: Zigzag3D,
  spring: Spring3D,
}

export const EDGE_STYLES_2D: Record<string, (props: { color: string; width: number }) => EdgeStyle2DConfig> = {
  solid: Solid2D,
  dashed: Dashed2D,
  dotted: Dotted2D,
  wavy: Wavy2D,
  zigzag: Zigzag2D,
  spring: Spring2D,
}

// ============ Helper Functions ============
export function getNodeShape3D(shapeId: string) {
  return NODE_SHAPES_3D[shapeId] || NODE_SHAPES_3D['sphere']
}

export function getNodeShape2D(shapeId: string) {
  return NODE_SHAPES_2D[shapeId] || NODE_SHAPES_2D['sphere']
}

export function getEdgeStyle3D(styleId: string) {
  return EDGE_STYLES_3D[styleId] || EDGE_STYLES_3D['solid']
}

export function getEdgeStyle2D(styleId: string) {
  return EDGE_STYLES_2D[styleId] || EDGE_STYLES_2D['solid']
}

// ============ Node Effects ============
export { NODE_EFFECTS, EFFECT_META, getNodeEffect } from './effects'

// ============ Edge Effects ============
export { EDGE_EFFECTS, EDGE_EFFECT_META, getEdgeEffect } from './edges/effects'

// Edge style metadata for UI
export const EDGE_STYLE_META = [
  { id: 'solid', name: 'Solid', icon: '─' },
  { id: 'dashed', name: 'Dashed', icon: '┄' },
  { id: 'dotted', name: 'Dotted', icon: '┈' },
  { id: 'wavy', name: 'Wavy', icon: '∿' },
  { id: 'zigzag', name: 'Zigzag', icon: '⚡' },
  { id: 'spring', name: 'Spring', icon: '🌀' },
]

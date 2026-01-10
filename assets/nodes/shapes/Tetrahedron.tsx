import { Tetrahedron as DreiTetrahedron } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Tetrahedron3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiTetrahedron args={[size]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiTetrahedron>
  )
}

export function Tetrahedron2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'triangle',
    size: size * 10,
    color: color,
  }
}

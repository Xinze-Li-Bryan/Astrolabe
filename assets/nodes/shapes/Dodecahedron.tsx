import { Dodecahedron as DreiDodecahedron } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Dodecahedron3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiDodecahedron args={[size]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiDodecahedron>
  )
}

export function Dodecahedron2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'pentagon',
    size: size * 10,
    color: color,
  }
}

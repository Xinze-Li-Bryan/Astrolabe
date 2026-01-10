import { Cylinder as DreiCylinder } from '@react-three/drei'
import type { NodeShape3DProps, NodeShape2DConfig } from '../../types'

export function Cylinder3D({ size, color, isSelected }: NodeShape3DProps) {
  return (
    <DreiCylinder args={[size, size, size * 1.5, 32]}>
      <meshStandardMaterial
        color={color}
        emissive={isSelected ? color : '#000000'}
        emissiveIntensity={isSelected ? 0.8 : 0}
      />
    </DreiCylinder>
  )
}

export function Cylinder2D({ size, color }: NodeShape3DProps): NodeShape2DConfig {
  return {
    type: 'circle',
    size: size * 10,
    color: color,
  }
}

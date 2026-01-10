import { Line } from '@react-three/drei'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

export function Solid3D({ start, end, color, width }: EdgeStyle3DProps) {
  return (
    <Line
      points={[start, end]}
      color={color}
      lineWidth={width}
    />
  )
}

export function Solid2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'line',
    color: color,
    size: width,
  }
}

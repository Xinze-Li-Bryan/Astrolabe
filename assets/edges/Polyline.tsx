import { Line } from '@react-three/drei'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

export function Polyline3D({ start, end, color, width }: EdgeStyle3DProps) {
  // Polyline: through midpoint
  const mid: [number, number, number] = [
    start[0],
    (start[1] + end[1]) / 2,
    (start[2] + end[2]) / 2,
  ]

  return (
    <Line
      points={[start, mid, end]}
      color={color}
      lineWidth={width}
    />
  )
}

export function Polyline2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'polyline',
    color: color,
    size: width,
  }
}

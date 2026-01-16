'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

// Calculate position on quadratic Bezier curve
function getQuadraticBezierPoint(
  start: [number, number, number],
  control: [number, number, number],
  end: [number, number, number],
  t: number
): [number, number, number] {
  const t1 = 1 - t
  return [
    t1 * t1 * start[0] + 2 * t1 * t * control[0] + t * t * end[0],
    t1 * t1 * start[1] + 2 * t1 * t * control[1] + t * t * end[1],
    t1 * t1 * start[2] + 2 * t1 * t * control[2] + t * t * end[2],
  ]
}

/**
 * Lightning Effect - flickering electric arc along the edge
 * Supports curved paths via controlPoint for bidirectional edges
 */
export function Lightning({ start, end, color, width, controlPoint }: EdgeEffectProps) {
  const lineRef = useRef<THREE.Line>(null)
  const pointsRef = useRef<[number, number, number][]>([])
  const timeRef = useRef(0)

  // Calculate perpendicular vector for jitter
  const perp = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    )
    direction.normalize()

    const up = new THREE.Vector3(0, 1, 0)
    const perpendicular = new THREE.Vector3().crossVectors(direction, up).normalize()
    if (perpendicular.length() < 0.001) {
      perpendicular.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize()
    }

    return perpendicular
  }, [start, end])

  // Generate lightning path
  const generateLightning = () => {
    const segments = 12
    const points: [number, number, number][] = []
    const amplitude = 0.15

    for (let i = 0; i <= segments; i++) {
      const t = i / segments

      // Base position - use curve if controlPoint exists
      let base: [number, number, number]
      if (controlPoint) {
        base = getQuadraticBezierPoint(start, controlPoint, end, t)
      } else {
        base = [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          start[2] + (end[2] - start[2]) * t,
        ]
      }

      // Random offset, fades at edges
      const edgeFade = Math.sin(t * Math.PI)
      const jitter = (Math.random() - 0.5) * 2 * amplitude * edgeFade

      points.push([
        base[0] + perp.x * jitter,
        base[1] + perp.y * jitter,
        base[2] + perp.z * jitter,
      ])
    }

    return points
  }

  // Initialize
  useMemo(() => {
    pointsRef.current = generateLightning()
  }, [start, end, controlPoint])

  useFrame((_, delta) => {
    timeRef.current += delta

    // Regenerate lightning path periodically
    if (timeRef.current > 0.08) {
      timeRef.current = 0
      pointsRef.current = generateLightning()
    }
  })

  return (
    <group>
      {/* Main lightning line */}
      <Line
        points={pointsRef.current}
        color={color}
        lineWidth={width * 1.5}
        transparent
        opacity={0.9}
      />
      {/* Outer glow */}
      <Line
        points={pointsRef.current}
        color={color}
        lineWidth={width * 3}
        transparent
        opacity={0.3}
      />
    </group>
  )
}

export default Lightning

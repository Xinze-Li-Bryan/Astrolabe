'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

/**
 * Lightning Effect - flickering electric arc along the edge
 */
export function Lightning({ start, end, color, width }: EdgeEffectProps) {
  const lineRef = useRef<THREE.Line>(null)
  const pointsRef = useRef<[number, number, number][]>([])
  const timeRef = useRef(0)

  // Calculate direction and perpendicular vectors
  const { dir, perp, length } = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    )
    const len = direction.length()
    direction.normalize()

    const up = new THREE.Vector3(0, 1, 0)
    const perpendicular = new THREE.Vector3().crossVectors(direction, up).normalize()
    if (perpendicular.length() < 0.001) {
      perpendicular.crossVectors(direction, new THREE.Vector3(1, 0, 0)).normalize()
    }

    return { dir: direction, perp: perpendicular, length: len }
  }, [start, end])

  // Generate lightning path
  const generateLightning = () => {
    const segments = 12
    const points: [number, number, number][] = []
    const amplitude = 0.15

    for (let i = 0; i <= segments; i++) {
      const t = i / segments
      const baseX = start[0] + (end[0] - start[0]) * t
      const baseY = start[1] + (end[1] - start[1]) * t
      const baseZ = start[2] + (end[2] - start[2]) * t

      // Random offset, fades at edges
      const edgeFade = Math.sin(t * Math.PI)
      const jitter = (Math.random() - 0.5) * 2 * amplitude * edgeFade

      points.push([
        baseX + perp.x * jitter,
        baseY + perp.y * jitter,
        baseZ + perp.z * jitter,
      ])
    }

    return points
  }

  // Initialize
  useMemo(() => {
    pointsRef.current = generateLightning()
  }, [start, end])

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

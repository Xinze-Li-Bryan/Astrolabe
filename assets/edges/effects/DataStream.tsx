'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

const SEGMENT_COUNT = 6

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
 * Data Stream Effect - digital data blocks flowing along the edge
 * Supports curved paths via controlPoint for bidirectional edges
 */
export function DataStream({ start, end, color, width, controlPoint }: EdgeEffectProps) {
  const groupRef = useRef<THREE.Group>(null)
  const progressRef = useRef<number[]>([])

  // Initialize data block positions
  useMemo(() => {
    progressRef.current = Array.from({ length: SEGMENT_COUNT }, (_, i) => i / SEGMENT_COUNT)
  }, [])

  const blockSize = Math.max(width * 0.08, 0.04)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    const speed = 0.5

    groupRef.current.children.forEach((block, i) => {
      // Update progress
      progressRef.current[i] = (progressRef.current[i] + delta * speed) % 1

      const t = progressRef.current[i]

      // Calculate position - use curve if controlPoint exists, otherwise straight line
      let pos: [number, number, number]
      if (controlPoint) {
        pos = getQuadraticBezierPoint(start, controlPoint, end, t)
      } else {
        pos = [
          start[0] + (end[0] - start[0]) * t,
          start[1] + (end[1] - start[1]) * t,
          start[2] + (end[2] - start[2]) * t,
        ]
      }
      block.position.set(pos[0], pos[1], pos[2])

      // Fade in/out
      const opacity = Math.sin(t * Math.PI)
      const mat = (block as THREE.Mesh).material as THREE.MeshBasicMaterial
      mat.opacity = opacity * 0.9

      // Rotation animation
      block.rotation.x += delta * 2
      block.rotation.y += delta * 3
    })
  })

  return (
    <group ref={groupRef}>
      {Array.from({ length: SEGMENT_COUNT }).map((_, i) => (
        <mesh key={i}>
          <boxGeometry args={[blockSize, blockSize, blockSize]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.8}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

export default DataStream

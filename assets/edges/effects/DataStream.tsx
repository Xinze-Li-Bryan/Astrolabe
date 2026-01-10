'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

const SEGMENT_COUNT = 6

/**
 * Data Stream Effect - digital data blocks flowing along the edge
 */
export function DataStream({ start, end, color, width }: EdgeEffectProps) {
  const groupRef = useRef<THREE.Group>(null)
  const progressRef = useRef<number[]>([])

  // Initialize data block positions
  useMemo(() => {
    progressRef.current = Array.from({ length: SEGMENT_COUNT }, (_, i) => i / SEGMENT_COUNT)
  }, [])

  // Calculate direction
  const { dir, length } = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    )
    const len = direction.length()
    direction.normalize()
    return { dir: direction, length: len }
  }, [start, end])

  const blockSize = Math.max(width * 0.08, 0.04)

  useFrame((_, delta) => {
    if (!groupRef.current) return

    const speed = 0.5

    groupRef.current.children.forEach((block, i) => {
      // Update progress
      progressRef.current[i] = (progressRef.current[i] + delta * speed) % 1

      const t = progressRef.current[i]

      // Calculate position
      block.position.set(
        start[0] + dir.x * length * t,
        start[1] + dir.y * length * t,
        start[2] + dir.z * length * t
      )

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

'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { EdgeEffectProps } from '../../types'

/**
 * Energy Pulse Effect - energy wave propagating along the edge
 */
export function EnergyPulse({ start, end, color, width }: EdgeEffectProps) {
  const pulse1Ref = useRef<THREE.Mesh>(null)
  const pulse2Ref = useRef<THREE.Mesh>(null)
  const progress1Ref = useRef(0)
  const progress2Ref = useRef(0.5) // Second pulse offset

  // Calculate direction and length
  const { dir, length, midPoint } = useMemo(() => {
    const direction = new THREE.Vector3(
      end[0] - start[0],
      end[1] - start[1],
      end[2] - start[2]
    )
    const len = direction.length()
    direction.normalize()

    const mid: [number, number, number] = [
      (start[0] + end[0]) / 2,
      (start[1] + end[1]) / 2,
      (start[2] + end[2]) / 2,
    ]

    return { dir: direction, length: len, midPoint: mid }
  }, [start, end])

  const pulseSize = Math.max(width * 0.2, 0.1)

  useFrame((_, delta) => {
    const speed = 0.5

    // Update first pulse
    if (pulse1Ref.current) {
      progress1Ref.current = (progress1Ref.current + delta * speed) % 1
      const t = progress1Ref.current

      pulse1Ref.current.position.set(
        start[0] + dir.x * length * t,
        start[1] + dir.y * length * t,
        start[2] + dir.z * length * t
      )

      // Pulse scaling effect
      const scale = 1 + Math.sin(t * Math.PI) * 0.5
      pulse1Ref.current.scale.setScalar(scale)

      const mat = pulse1Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(t * Math.PI) * 0.7
    }

    // Update second pulse
    if (pulse2Ref.current) {
      progress2Ref.current = (progress2Ref.current + delta * speed) % 1
      const t = progress2Ref.current

      pulse2Ref.current.position.set(
        start[0] + dir.x * length * t,
        start[1] + dir.y * length * t,
        start[2] + dir.z * length * t
      )

      const scale = 1 + Math.sin(t * Math.PI) * 0.5
      pulse2Ref.current.scale.setScalar(scale)

      const mat = pulse2Ref.current.material as THREE.MeshBasicMaterial
      mat.opacity = Math.sin(t * Math.PI) * 0.7
    }
  })

  return (
    <>
      {/* Pulse 1 */}
      <mesh ref={pulse1Ref} position={start}>
        <sphereGeometry args={[pulseSize, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* Pulse 2 */}
      <mesh ref={pulse2Ref} position={midPoint}>
        <sphereGeometry args={[pulseSize * 0.8, 16, 16]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

export default EnergyPulse

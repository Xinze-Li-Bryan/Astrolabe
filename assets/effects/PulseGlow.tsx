'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Pulse Glow Effect - periodically expanding rings
 */
export function PulseGlow({ size, color }: NodeEffectProps) {
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime

    // First ring - brighter breathing
    if (ring1Ref.current) {
      const scale1 = 1 + Math.sin(t * 2) * 0.3
      ring1Ref.current.scale.setScalar(scale1)
      const mat1 = ring1Ref.current.material as THREE.MeshBasicMaterial
      mat1.opacity = 0.6 - Math.sin(t * 2) * 0.25
    }

    // Second ring (phase offset)
    if (ring2Ref.current) {
      const scale2 = 1 + Math.sin(t * 2 + Math.PI) * 0.3
      ring2Ref.current.scale.setScalar(scale2)
      const mat2 = ring2Ref.current.material as THREE.MeshBasicMaterial
      mat2.opacity = 0.5 - Math.sin(t * 2 + Math.PI) * 0.2
    }
  })

  const ringSize = size * 1.8

  return (
    <>
      {/* Inner core glow */}
      <mesh>
        <sphereGeometry args={[ringSize * 0.8, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* First pulse ring */}
      <mesh ref={ring1Ref}>
        <sphereGeometry args={[ringSize, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Second pulse ring */}
      <mesh ref={ring2Ref}>
        <sphereGeometry args={[ringSize * 1.3, 32, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.3}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </>
  )
}

export default PulseGlow

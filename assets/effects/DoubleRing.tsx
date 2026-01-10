'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Double Ring Effect - two intersecting rings rotating at different speeds
 */
export function DoubleRing({ size, color }: NodeEffectProps) {
  const ring1Ref = useRef<THREE.Mesh>(null)
  const ring2Ref = useRef<THREE.Mesh>(null)

  useFrame((_, delta) => {
    if (ring1Ref.current) {
      ring1Ref.current.rotation.z += delta * 0.5
      ring1Ref.current.rotation.x += delta * 0.1
    }
    if (ring2Ref.current) {
      ring2Ref.current.rotation.z -= delta * 0.3
      ring2Ref.current.rotation.y += delta * 0.15
    }
  })

  return (
    <group>
      {/* First ring - tilted 45 degrees - solid */}
      <mesh ref={ring1Ref} rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[size * 1.6, size * 0.08, 8, 48]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* First ring glow */}
      <mesh rotation={[Math.PI / 4, 0, 0]}>
        <torusGeometry args={[size * 1.6, size * 0.2, 8, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {/* Second ring - tilted -45 degrees - solid */}
      <mesh ref={ring2Ref} rotation={[-Math.PI / 4, Math.PI / 2, 0]}>
        <torusGeometry args={[size * 1.6, size * 0.08, 8, 48]} />
        <meshBasicMaterial color={color} />
      </mesh>
      {/* Second ring glow */}
      <mesh rotation={[-Math.PI / 4, Math.PI / 2, 0]}>
        <torusGeometry args={[size * 1.6, size * 0.2, 8, 48]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.4}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default DoubleRing

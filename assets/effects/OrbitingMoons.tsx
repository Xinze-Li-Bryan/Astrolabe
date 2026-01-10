'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Orbiting Moons Effect - two small spheres orbiting the node
 */
export function OrbitingMoons({ size, color }: NodeEffectProps) {
  const group1Ref = useRef<THREE.Group>(null)
  const group2Ref = useRef<THREE.Group>(null)

  const orbitRadius = size * 2.2
  const moonSize = size * 0.25

  useFrame((state) => {
    const t = state.clock.elapsedTime

    if (group1Ref.current) {
      group1Ref.current.rotation.y = t * 1.2
    }
    if (group2Ref.current) {
      group2Ref.current.rotation.y = -t * 0.8
      group2Ref.current.rotation.x = Math.PI * 0.3
    }
  })

  return (
    <>
      {/* First orbit - horizontal */}
      <group ref={group1Ref}>
        {/* Moon body - solid highlight */}
        <mesh position={[orbitRadius, 0, 0]}>
          <sphereGeometry args={[moonSize, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
        {/* Moon glow */}
        <mesh position={[orbitRadius, 0, 0]}>
          <sphereGeometry args={[moonSize * 1.5, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {/* Orbit line */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[orbitRadius - 0.03, orbitRadius + 0.03, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.4}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>

      {/* Second orbit - tilted */}
      <group ref={group2Ref}>
        {/* Moon body */}
        <mesh position={[orbitRadius * 0.85, 0, 0]}>
          <sphereGeometry args={[moonSize * 0.7, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
        {/* Moon glow */}
        <mesh position={[orbitRadius * 0.85, 0, 0]}>
          <sphereGeometry args={[moonSize * 1.2, 16, 16]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
        {/* Orbit line */}
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[orbitRadius * 0.85 - 0.02, orbitRadius * 0.85 + 0.02, 64]} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.3}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      </group>
    </>
  )
}

export default OrbitingMoons

'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { NodeEffectProps } from '../types'

/**
 * Polyhedron Shell Effect - icosahedron wireframe slowly rotating
 * Uses LineSegments + EdgesGeometry for thicker edges
 */
export function PolyhedronShell({ size, color }: NodeEffectProps) {
  const groupRef = useRef<THREE.Group>(null)

  // Create edge geometry
  const edgesGeometry = useMemo(() => {
    const icosahedron = new THREE.IcosahedronGeometry(size * 1.8, 0)
    return new THREE.EdgesGeometry(icosahedron)
  }, [size])

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.x += delta * 0.2
      groupRef.current.rotation.y += delta * 0.3
    }
  })

  return (
    <group ref={groupRef}>
      {/* Inner solid lines - brightest */}
      <lineSegments geometry={edgesGeometry}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={1}
          linewidth={2}
        />
      </lineSegments>
      {/* Middle layer glow */}
      <lineSegments geometry={edgesGeometry} scale={1.05}>
        <lineBasicMaterial
          color={color}
          transparent
          opacity={0.6}
          linewidth={1}
        />
      </lineSegments>
      {/* Outer layer halo */}
      <mesh>
        <icosahedronGeometry args={[size * 1.85, 0]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.15}
          wireframe
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

export default PolyhedronShell

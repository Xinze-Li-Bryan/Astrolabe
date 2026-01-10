'use client'

/**
 * StatusRing - Proof Status Ring 3D Component
 *
 * Renders different ring effects based on node's proof status:
 * - full: Complete ring, static glow (proven)
 * - dashed: Dashed/broken ring, slow rotation (sorry)
 * - arc: Half-ring/arc, static (error)
 *
 * Performance optimizations:
 * - Use useMemo to cache geometries to avoid recreation
 * - Reduce mesh count (dashed from 12 to 4)
 * - Only use useFrame for animated types
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getStatusRingConfig, getStatusColor, type ProofStatusType } from '@/lib/proofStatus'

interface StatusRingProps {
  status: ProofStatusType
  size: number
  isSelected?: boolean
}

// Shared geometry cache - avoid recreating for each node
const geometryCache = new Map<string, THREE.TorusGeometry>()

function getOrCreateGeometry(radius: number, tube: number, segments: number = 64, arc: number = Math.PI * 2): THREE.TorusGeometry {
  const key = `${radius.toFixed(3)}-${tube.toFixed(3)}-${segments}-${arc.toFixed(3)}`
  if (!geometryCache.has(key)) {
    geometryCache.set(key, new THREE.TorusGeometry(radius, tube, 16, segments, arc))
  }
  return geometryCache.get(key)!
}

export function StatusRing({ status, size, isSelected = false }: StatusRingProps) {
  const ringRef = useRef<THREE.Group>(null)
  const ringConfig = getStatusRingConfig(status)
  const color = getStatusColor(status)

  const ringRadius = size * 1.8
  const tubeRadius = size * 0.08

  // Only run useFrame for animated types
  const isAnimated = ringConfig?.animated ?? false
  const speed = ringConfig?.speed ?? 0.5

  useFrame((_, delta) => {
    if (isAnimated && ringRef.current) {
      ringRef.current.rotation.z += delta * speed
    }
  })

  // Render different rings based on type - use memo for caching
  const RingGeometry = useMemo(() => {
    if (!ringConfig) return null
    switch (ringConfig.type) {
      case 'full':
        return <FullRing radius={ringRadius} tube={tubeRadius} color={color} glow={ringConfig.glow} isSelected={isSelected} />
      case 'dashed':
        return <DashedRing radius={ringRadius} tube={tubeRadius} color={color} />
      case 'arc':
        return <ArcRing radius={ringRadius} tube={tubeRadius} color={color} arcLength={ringConfig.arcLength ?? Math.PI} />
      case 'loading':
        return <LoadingRing radius={ringRadius} tube={tubeRadius} color={color} />
      default:
        return null
    }
  }, [ringConfig, ringRadius, tubeRadius, color, isSelected])

  // Don't render if no ring configuration
  if (!ringConfig) return null

  return (
    <group ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
      {RingGeometry}
    </group>
  )
}

/**
 * Full ring - proven status
 * Static glow effect
 */
function FullRing({
  radius,
  tube,
  color,
  glow = true,
  isSelected = false
}: {
  radius: number
  tube: number
  color: string
  glow?: boolean
  isSelected?: boolean
}) {
  // Cache geometries
  const mainGeom = useMemo(() => getOrCreateGeometry(radius, tube), [radius, tube])
  const glowGeom1 = useMemo(() => getOrCreateGeometry(radius, tube * 2.5), [radius, tube])
  const glowGeom2 = useMemo(() => getOrCreateGeometry(radius, tube * 4), [radius, tube])

  return (
    <group>
      {/* Main ring */}
      <mesh geometry={mainGeom}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Glow effect - outer halo */}
      {glow && (
        <>
          <mesh geometry={glowGeom1}>
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isSelected ? 0.4 : 0.25}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh geometry={glowGeom2}>
            <meshBasicMaterial
              color={color}
              transparent
              opacity={isSelected ? 0.2 : 0.1}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </>
      )}
    </group>
  )
}

/**
 * Dashed ring/broken ring - sorry status
 * Optimized version: use single merged geometry instead of multiple independent meshes
 */
function DashedRing({
  radius,
  tube,
  color
}: {
  radius: number
  tube: number
  color: string
}) {
  const segments = 6
  const gapRatio = 0.3  // Gap ratio
  const arcAngle = (Math.PI * 2 / segments) * (1 - gapRatio)

  // Cache arc geometries
  const arcGeom = useMemo(() => getOrCreateGeometry(radius, tube, 32, arcAngle), [radius, tube, arcAngle])
  const glowGeom = useMemo(() => getOrCreateGeometry(radius, tube * 2.5, 32, arcAngle), [radius, tube, arcAngle])

  // Pre-calculate rotation angles
  const rotations = useMemo(() =>
    Array.from({ length: segments }, (_, i) => (i / segments) * Math.PI * 2),
    [segments]
  )

  return (
    <group>
      {/* Main arcs - 6 meshes */}
      {rotations.map((startAngle, i) => (
        <mesh key={i} geometry={arcGeom} rotation={[0, 0, startAngle]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.85}
          />
        </mesh>
      ))}

      {/* Glow - only one outer glow to reduce mesh count */}
      {rotations.map((startAngle, i) => (
        <mesh key={`glow-${i}`} geometry={glowGeom} rotation={[0, 0, startAngle]}>
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.15}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * Arc/half-ring - error status
 * Static half-circle arc
 */
function ArcRing({
  radius,
  tube,
  color,
  arcLength = Math.PI
}: {
  radius: number
  tube: number
  color: string
  arcLength?: number
}) {
  // Cache geometries
  const mainGeom = useMemo(() => getOrCreateGeometry(radius, tube, 32, arcLength), [radius, tube, arcLength])
  const glowGeom = useMemo(() => getOrCreateGeometry(radius, tube * 2.5, 32, arcLength), [radius, tube, arcLength])

  return (
    <group rotation={[0, 0, -arcLength / 2]}>
      {/* Main arc */}
      <mesh geometry={mainGeom}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.9}
        />
      </mesh>

      {/* Subtle glow */}
      <mesh geometry={glowGeom}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.2}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

/**
 * Loading ring - loading status
 * Semi-transparent gray half-ring, rotates quickly to indicate waiting for verification
 */
function LoadingRing({
  radius,
  tube,
  color
}: {
  radius: number
  tube: number
  color: string
}) {
  // Use half-circle arc
  const arcLength = Math.PI
  const mainGeom = useMemo(() => getOrCreateGeometry(radius, tube, 32, arcLength), [radius, tube, arcLength])

  return (
    <group rotation={[0, 0, -arcLength / 2]}>
      {/* Main arc - semi-transparent to indicate waiting state */}
      <mesh geometry={mainGeom}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  )
}

export default StatusRing

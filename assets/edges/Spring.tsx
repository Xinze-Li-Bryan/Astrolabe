'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

const COILS = 8        // Number of spring coils
const RADIUS = 0.15    // Spring radius
const SEGMENTS_PER_COIL = 12  // Segments per coil

// Generate spring line points to Float32Array
function generateSpringPoints(
  start: [number, number, number],
  end: [number, number, number],
  coils: number = COILS,
  radius: number = RADIUS
): Float32Array {
  // Calculate direction vector
  const dir = new THREE.Vector3(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  )
  const length = dir.length()
  if (length < 0.001) {
    // Points coincide, return single point
    return new Float32Array([start[0], start[1], start[2]])
  }
  dir.normalize()

  // Adjust coils and radius based on length
  const actualCoils = Math.max(3, Math.min(coils, Math.floor(length * 3)))
  const actualRadius = Math.min(radius, length * 0.1)

  // Calculate two vectors perpendicular to direction (for circular motion)
  const up = new THREE.Vector3(0, 1, 0)
  let perpA = new THREE.Vector3().crossVectors(dir, up).normalize()

  // If dir and up are parallel, use another vector
  if (perpA.length() < 0.001) {
    perpA = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize()
  }

  // Second perpendicular vector
  const perpB = new THREE.Vector3().crossVectors(dir, perpA).normalize()

  const totalSegments = actualCoils * SEGMENTS_PER_COIL
  // +2 for straight segments at start and end
  const points = new Float32Array((totalSegments + 3) * 3)

  // Start point (straight segment)
  points[0] = start[0]
  points[1] = start[1]
  points[2] = start[2]

  // Spring body
  for (let i = 0; i <= totalSegments; i++) {
    const t = i / totalSegments
    // Position along the line (leave space for end segments)
    const linearT = 0.1 + t * 0.8  // From 10% to 90% position
    const baseX = start[0] + (end[0] - start[0]) * linearT
    const baseY = start[1] + (end[1] - start[1]) * linearT
    const baseZ = start[2] + (end[2] - start[2]) * linearT

    // Circular angle
    const angle = t * actualCoils * Math.PI * 2

    // Shrink radius at both ends
    const edgeFade = Math.sin(t * Math.PI)
    const currentRadius = actualRadius * edgeFade

    // Circular offset
    const offsetA = Math.cos(angle) * currentRadius
    const offsetB = Math.sin(angle) * currentRadius

    const idx = (i + 1) * 3
    points[idx] = baseX + perpA.x * offsetA + perpB.x * offsetB
    points[idx + 1] = baseY + perpA.y * offsetA + perpB.y * offsetB
    points[idx + 2] = baseZ + perpA.z * offsetA + perpB.z * offsetB
  }

  // End point (straight segment)
  const lastIdx = (totalSegments + 2) * 3
  points[lastIdx] = end[0]
  points[lastIdx + 1] = end[1]
  points[lastIdx + 2] = end[2]

  return points
}

export function Spring3D({ start, end, color, width, positionsRef, source, target }: EdgeStyle3DProps) {
  const lineRef = useRef<Line2>(null)

  // Update position every frame
  useFrame(() => {
    if (!lineRef.current) return

    // Prefer positionsRef for real-time positions
    let currentStart = start
    let currentEnd = end
    if (positionsRef && source && target) {
      const s = positionsRef.current.get(source)
      const e = positionsRef.current.get(target)
      if (s) currentStart = s
      if (e) currentEnd = e
    }

    const points = generateSpringPoints(currentStart, currentEnd)
    lineRef.current.geometry.setPositions(points)
  })

  // Initial points - simple straight line
  const initialPoints: [number, number, number][] = [start, end]

  return (
    <Line
      ref={lineRef}
      points={initialPoints}
      color={color}
      lineWidth={width}
    />
  )
}

export function Spring2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'spring',
    color: color,
    size: width,
  }
}

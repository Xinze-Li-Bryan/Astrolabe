'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

const SEGMENTS = 8
const AMPLITUDE = 0.25

// Generate zigzag line points to Float32Array
function generateZigzagPoints(
  start: [number, number, number],
  end: [number, number, number],
  segments: number = SEGMENTS,
  amplitude: number = AMPLITUDE
): Float32Array {
  // Calculate direction vector
  const dir = new THREE.Vector3(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  )
  const length = dir.length()
  dir.normalize()

  // Calculate perpendicular vector (for zigzag offset)
  const up = new THREE.Vector3(0, 1, 0)
  const perp = new THREE.Vector3().crossVectors(dir, up).normalize()

  // If dir and up are parallel, use another vector
  if (perp.length() < 0.001) {
    perp.crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize()
  }

  // Adjust segment count based on length
  const actualSegments = Math.max(4, Math.min(segments, Math.floor(length * 2)))

  // +2 for start and end points
  const points = new Float32Array((actualSegments + 1) * 3)

  // Start point
  points[0] = start[0]
  points[1] = start[1]
  points[2] = start[2]

  for (let i = 1; i < actualSegments; i++) {
    const t = i / actualSegments
    // Position along the line
    const baseX = start[0] + (end[0] - start[0]) * t
    const baseY = start[1] + (end[1] - start[1]) * t
    const baseZ = start[2] + (end[2] - start[2]) * t

    // Zigzag offset (alternating left/right), fades at edges
    const edgeFade = Math.sin(t * Math.PI)
    const zigzag = (i % 2 === 0 ? 1 : -1) * amplitude * edgeFade

    points[i * 3] = baseX + perp.x * zigzag
    points[i * 3 + 1] = baseY + perp.y * zigzag
    points[i * 3 + 2] = baseZ + perp.z * zigzag
  }

  // End point
  points[actualSegments * 3] = end[0]
  points[actualSegments * 3 + 1] = end[1]
  points[actualSegments * 3 + 2] = end[2]

  return points
}

export function Zigzag3D({ start, end, color, width, positionsRef, source, target }: EdgeStyle3DProps) {
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

    const points = generateZigzagPoints(currentStart, currentEnd)
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

export function Zigzag2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'zigzag',
    color: color,
    size: width,
  }
}

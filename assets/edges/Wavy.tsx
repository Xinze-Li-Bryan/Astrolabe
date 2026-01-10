'use client'

import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import type { Line2 } from 'three-stdlib'
import type { EdgeStyle3DProps, EdgeStyle2DConfig } from '../types'

const SEGMENTS = 30
const AMPLITUDE = 0.3

// Generate wavy line points to Float32Array
function generateWavyPoints(
  start: [number, number, number],
  end: [number, number, number],
  segments: number = SEGMENTS,
  amplitude: number = AMPLITUDE
): Float32Array {
  const points = new Float32Array((segments + 1) * 3)

  // Calculate direction vector
  const dir = new THREE.Vector3(
    end[0] - start[0],
    end[1] - start[1],
    end[2] - start[2]
  )
  const length = dir.length()
  dir.normalize()

  // Calculate perpendicular vector (for wave offset)
  const up = new THREE.Vector3(0, 1, 0)
  const perp = new THREE.Vector3().crossVectors(dir, up).normalize()

  // If dir and up are parallel, use another vector
  if (perp.length() < 0.001) {
    perp.crossVectors(dir, new THREE.Vector3(1, 0, 0)).normalize()
  }

  // Wave frequency based on length
  const frequency = Math.max(2, length * 1.5)

  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    // Position along the line
    const baseX = start[0] + (end[0] - start[0]) * t
    const baseY = start[1] + (end[1] - start[1]) * t
    const baseZ = start[2] + (end[2] - start[2]) * t

    // Wave offset (fades at both ends)
    const waveScale = Math.sin(t * Math.PI) // 0 at ends, 1 in middle
    const wave = Math.sin(t * frequency * Math.PI) * amplitude * waveScale

    points[i * 3] = baseX + perp.x * wave
    points[i * 3 + 1] = baseY + perp.y * wave
    points[i * 3 + 2] = baseZ + perp.z * wave
  }

  return points
}

export function Wavy3D({ start, end, color, width, positionsRef, source, target }: EdgeStyle3DProps) {
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

    const points = generateWavyPoints(currentStart, currentEnd)
    lineRef.current.geometry.setPositions(points)
  })

  // Initial points
  const initialPoints: [number, number, number][] = []
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS
    initialPoints.push([
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ])
  }

  return (
    <Line
      ref={lineRef}
      points={initialPoints}
      color={color}
      lineWidth={width}
    />
  )
}

export function Wavy2D({ color, width }: { color: string; width: number }): EdgeStyle2DConfig {
  return {
    type: 'wavy',
    color: color,
    size: width,
  }
}

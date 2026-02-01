import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * 3D Force Layout Web Worker Tests
 *
 * Test scenarios:
 * 1. Worker initialization and communication
 * 2. Physics step computation
 * 3. Position updates via message passing
 * 4. Barnes-Hut integration
 * 5. Stability detection
 */

describe('ForceLayout3DWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('physics computation (pure functions)', () => {
    it('should compute repulsion forces between nodes', async () => {
      const { computeRepulsionForces } = await import('../ForceLayout3DWorker')

      const positions: [number, number, number][] = [
        [0, 0, 0],
        [10, 0, 0],
      ]
      const forces: [number, number, number][] = [
        [0, 0, 0],
        [0, 0, 0],
      ]

      computeRepulsionForces(positions, forces, 100)

      // Node 0 should be pushed left (negative x)
      expect(forces[0][0]).toBeLessThan(0)
      // Node 1 should be pushed right (positive x)
      expect(forces[1][0]).toBeGreaterThan(0)
    })

    it('should compute spring forces for connected nodes', async () => {
      const { computeSpringForces } = await import('../ForceLayout3DWorker')

      const positions = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [20, 0, 0]], // Far apart
      ])
      const edges = [{ source: 'a', target: 'b' }]
      const forces = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [0, 0, 0]],
      ])

      computeSpringForces(positions, edges, forces, {
        springLength: 5,
        springStrength: 1,
      })

      // Nodes should be pulled together
      expect(forces.get('a')![0]).toBeGreaterThan(0) // a pulled towards b
      expect(forces.get('b')![0]).toBeLessThan(0) // b pulled towards a
    })

    it('should compute center gravity forces', async () => {
      const { computeCenterGravity } = await import('../ForceLayout3DWorker')

      const positions = new Map<string, [number, number, number]>([
        ['a', [100, 50, 30]],
      ])
      const forces = new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
      ])

      computeCenterGravity(positions, forces, 0.1)

      // Node should be pulled towards center
      expect(forces.get('a')![0]).toBeLessThan(0) // pulled left towards 0
      expect(forces.get('a')![1]).toBeLessThan(0) // pulled down towards 0
      expect(forces.get('a')![2]).toBeLessThan(0) // pulled back towards 0
    })

    it('should apply velocity damping', async () => {
      const { applyDamping } = await import('../ForceLayout3DWorker')

      const velocities = new Map<string, [number, number, number]>([
        ['a', [10, 20, 30]],
      ])

      applyDamping(velocities, 0.5)

      expect(velocities.get('a')).toEqual([5, 10, 15])
    })

    it('should limit maximum velocity', async () => {
      const { limitVelocity } = await import('../ForceLayout3DWorker')

      const vel: [number, number, number] = [100, 100, 100]
      const maxVel = 10

      const limited = limitVelocity(vel, maxVel)

      const speed = Math.sqrt(limited[0] ** 2 + limited[1] ** 2 + limited[2] ** 2)
      expect(speed).toBeCloseTo(maxVel, 5)
    })
  })

  describe('simulation step', () => {
    it('should compute one simulation step and return total movement', async () => {
      const { simulateStep } = await import('../ForceLayout3DWorker')

      const state = {
        positions: new Map<string, [number, number, number]>([
          ['a', [0, 0, 0]],
          ['b', [5, 0, 0]],
        ]),
        velocities: new Map<string, [number, number, number]>([
          ['a', [0, 0, 0]],
          ['b', [0, 0, 0]],
        ]),
        edges: [{ source: 'a', target: 'b' }],
        physics: {
          repulsionStrength: 100,
          springLength: 8,
          springStrength: 1,
          centerStrength: 0.05,
          damping: 0.8,
        },
      }

      const movement = simulateStep(state, 0.016)

      // Should return some movement (forces were applied)
      expect(movement).toBeGreaterThan(0)

      // Positions should have changed
      expect(state.positions.get('a')).not.toEqual([0, 0, 0])
    })

    it('should detect stability when movement is low', async () => {
      const { isStable } = await import('../ForceLayout3DWorker')

      expect(isStable(0.001, 0.01)).toBe(true)
      expect(isStable(0.1, 0.01)).toBe(false)
    })
  })

  describe('Barnes-Hut integration', () => {
    it('should use Barnes-Hut for large node counts', async () => {
      const { shouldUseBarnesHut, computeRepulsionForces } = await import(
        '../ForceLayout3DWorker'
      )

      // Small graph - no Barnes-Hut
      expect(shouldUseBarnesHut(50)).toBe(false)

      // Large graph - use Barnes-Hut
      expect(shouldUseBarnesHut(200)).toBe(true)
    })
  })

  describe('worker message protocol', () => {
    it('should define correct message types', async () => {
      const { WorkerMessageType } = await import('../ForceLayout3DWorker')

      expect(WorkerMessageType.INIT).toBe('init')
      expect(WorkerMessageType.STEP).toBe('step')
      expect(WorkerMessageType.POSITIONS).toBe('positions')
      expect(WorkerMessageType.STOP).toBe('stop')
    })
  })
})

describe('ForceLayout3DWorker integration', () => {
  it('should export all necessary functions for worker', async () => {
    const module = await import('../ForceLayout3DWorker')

    expect(module.computeRepulsionForces).toBeDefined()
    expect(module.computeSpringForces).toBeDefined()
    expect(module.computeCenterGravity).toBeDefined()
    expect(module.simulateStep).toBeDefined()
    expect(module.applyDamping).toBeDefined()
    expect(module.limitVelocity).toBeDefined()
    expect(module.isStable).toBeDefined()
  })
})

describe('Namespace Clustering', () => {
  it('should compute cluster centroids correctly', async () => {
    const { computeClusterCentroids } = await import('../ForceLayout3DWorker')

    const namespaceGroups = new Map([
      ['Mathlib.Algebra', ['node1', 'node2']],
      ['Mathlib.Data', ['node3']],
    ])
    const positions = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [10, 0, 0]],
      ['node3', [100, 100, 100]],
    ])

    const centroids = computeClusterCentroids(namespaceGroups, positions)

    // Mathlib.Algebra centroid should be at (5, 0, 0)
    expect(centroids.get('Mathlib.Algebra')).toEqual([5, 0, 0])
    // Mathlib.Data centroid should be at (100, 100, 100)
    expect(centroids.get('Mathlib.Data')).toEqual([100, 100, 100])
  })

  it('should apply clustering force pulling nodes toward centroid', async () => {
    const { computeClusteringForces } = await import('../ForceLayout3DWorker')

    const namespaceGroups = new Map([
      ['Mathlib.Algebra', ['node1', 'node2']],
    ])
    const positions = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [100, 0, 0]], // Far from centroid (50, 0, 0)
    ])
    const forces = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [0, 0, 0]],
    ])

    computeClusteringForces(namespaceGroups, positions, forces, {
      clusteringStrength: 0.5,
      clusterSeparation: 0,
    })

    // node1 at (0,0,0) should be pulled toward centroid (50,0,0) - positive x
    expect(forces.get('node1')![0]).toBeGreaterThan(0)
    // node2 at (100,0,0) should be pulled toward centroid (50,0,0) - negative x
    expect(forces.get('node2')![0]).toBeLessThan(0)
  })

  it('should apply inter-cluster repulsion', async () => {
    const { computeClusteringForces } = await import('../ForceLayout3DWorker')

    const namespaceGroups = new Map([
      ['Mathlib.Algebra', ['node1']],
      ['Mathlib.Data', ['node2']],
    ])
    const positions = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [10, 0, 0]], // Close cluster
    ])
    const forces = new Map<string, [number, number, number]>([
      ['node1', [0, 0, 0]],
      ['node2', [0, 0, 0]],
    ])

    computeClusteringForces(namespaceGroups, positions, forces, {
      clusteringStrength: 0,
      clusterSeparation: 1.0, // Strong separation
    })

    // Clusters should repel each other
    expect(forces.get('node1')![0]).toBeLessThan(0) // pushed left
    expect(forces.get('node2')![0]).toBeGreaterThan(0) // pushed right
  })
})

describe('Adaptive Spring Length', () => {
  it('should compute node degrees correctly', async () => {
    const { computeNodeDegrees } = await import('../ForceLayout3DWorker')

    const edges = [
      { source: 'a', target: 'b' },
      { source: 'a', target: 'c' },
      { source: 'b', target: 'c' },
    ]

    const degrees = computeNodeDegrees(edges)

    // node a: 2 outgoing, 0 incoming
    expect(degrees.get('a')).toEqual({ in: 0, out: 2, total: 2 })
    // node b: 1 outgoing, 1 incoming
    expect(degrees.get('b')).toEqual({ in: 1, out: 1, total: 2 })
    // node c: 0 outgoing, 2 incoming
    expect(degrees.get('c')).toEqual({ in: 2, out: 0, total: 2 })
  })

  it('should calculate adaptive spring length based on node degrees', async () => {
    const { calculateAdaptiveSpringLength } = await import('../ForceLayout3DWorker')

    const lowDegree = { in: 1, out: 1, total: 2 }
    const highDegree = { in: 10, out: 10, total: 20 }

    const config = {
      baseLength: 8,
      mode: 'sqrt' as const,
      scaleFactor: 0.5,
      minLength: 4,
      maxLength: 40,
    }

    const lengthLow = calculateAdaptiveSpringLength(lowDegree, lowDegree, config)
    const lengthHigh = calculateAdaptiveSpringLength(highDegree, highDegree, config)

    // High degree nodes should have longer springs
    expect(lengthHigh).toBeGreaterThan(lengthLow)
    // Both should be within bounds
    expect(lengthLow).toBeGreaterThanOrEqual(config.minLength)
    expect(lengthHigh).toBeLessThanOrEqual(config.maxLength)
  })

  it('should support different adaptive modes (linear, sqrt, log)', async () => {
    const { calculateAdaptiveSpringLength } = await import('../ForceLayout3DWorker')

    const degree = { in: 5, out: 5, total: 10 }
    const baseConfig = { baseLength: 8, scaleFactor: 0.5, minLength: 4, maxLength: 40 }

    const linearLength = calculateAdaptiveSpringLength(degree, degree, { ...baseConfig, mode: 'linear' })
    const sqrtLength = calculateAdaptiveSpringLength(degree, degree, { ...baseConfig, mode: 'sqrt' })
    const logLength = calculateAdaptiveSpringLength(degree, degree, { ...baseConfig, mode: 'logarithmic' })

    // All should produce valid lengths
    expect(linearLength).toBeGreaterThan(0)
    expect(sqrtLength).toBeGreaterThan(0)
    expect(logLength).toBeGreaterThan(0)

    // Linear should grow fastest, log slowest
    expect(linearLength).toBeGreaterThan(sqrtLength)
    expect(sqrtLength).toBeGreaterThan(logLength)
  })

  it('should apply adaptive spring in simulation step', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    // Create a hub node connected to many others
    const nodeIds = ['hub', 'leaf1', 'leaf2', 'leaf3', 'leaf4', 'leaf5']
    const positions = new Map<string, [number, number, number]>()
    const velocities = new Map<string, [number, number, number]>()

    // Hub at center, leaves around it
    positions.set('hub', [0, 0, 0])
    velocities.set('hub', [0, 0, 0])
    for (let i = 1; i <= 5; i++) {
      const angle = (i / 5) * Math.PI * 2
      positions.set(`leaf${i}`, [Math.cos(angle) * 5, Math.sin(angle) * 5, 0])
      velocities.set(`leaf${i}`, [0, 0, 0])
    }

    const edges = [
      { source: 'hub', target: 'leaf1' },
      { source: 'hub', target: 'leaf2' },
      { source: 'hub', target: 'leaf3' },
      { source: 'hub', target: 'leaf4' },
      { source: 'hub', target: 'leaf5' },
    ]

    const state = {
      positions,
      velocities,
      edges,
      physics: {
        repulsionStrength: 100,
        springLength: 8,
        springStrength: 1,
        centerStrength: 0.05,
        damping: 0.8,
        // Adaptive spring enabled
        adaptiveSpringEnabled: true,
        adaptiveSpringMode: 'sqrt' as const,
        adaptiveSpringScale: 0.5,
      },
    }

    const movement = simulateStep(state, 0.016)
    expect(movement).toBeGreaterThan(0)
  })
})

describe('Full physics config', () => {
  it('should support all physics parameters in simulateStep', async () => {
    const { simulateStep } = await import('../ForceLayout3DWorker')

    const state = {
      positions: new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [10, 0, 0]],
      ]),
      velocities: new Map<string, [number, number, number]>([
        ['a', [0, 0, 0]],
        ['b', [0, 0, 0]],
      ]),
      edges: [{ source: 'a', target: 'b' }],
      physics: {
        // Basic physics
        repulsionStrength: 200,
        springLength: 8,
        springStrength: 1,
        centerStrength: 0.05,
        damping: 0.8,
        // Clustering
        clusteringEnabled: true,
        clusteringStrength: 0.3,
        clusterSeparation: 0.5,
        // Adaptive spring
        adaptiveSpringEnabled: true,
        adaptiveSpringMode: 'sqrt' as const,
        adaptiveSpringScale: 0.5,
      },
      // Namespace groups for clustering
      namespaceGroups: new Map([
        ['ns1', ['a', 'b']],
      ]),
    }

    // Should not throw
    const movement = simulateStep(state, 0.016)
    expect(movement).toBeGreaterThanOrEqual(0)
  })
})

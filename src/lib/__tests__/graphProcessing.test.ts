import { describe, it, expect } from 'vitest'
import {
  isTechnicalNode,
  processGraph,
  getTechnicalNodeIds,
  DEFAULT_FILTER_OPTIONS,
  type GraphFilterOptions,
} from '../graphProcessing'
import type { AstrolabeNode, AstrolabeEdge } from '@/types/graph'

// ============================================
// Test Helpers
// ============================================

function createNode(overrides: Partial<AstrolabeNode> & { id: string; name: string }): AstrolabeNode {
  return {
    kind: 'theorem',
    status: 'proven',
    defaultColor: '#A855F7',
    defaultSize: 1.0,
    defaultShape: 'sphere',
    pinned: false,
    visible: true,
    ...overrides,
  }
}

function createEdge(source: string, target: string, id?: string): AstrolabeEdge {
  return {
    id: id || `${source}->${target}`,
    source,
    target,
    fromLean: true,
    defaultColor: '#2ecc71',
    defaultWidth: 1.0,
    defaultStyle: 'solid',
    visible: true,
  }
}

// ============================================
// isTechnicalNode Tests
// ============================================

describe('isTechnicalNode', () => {
  describe('instance and class kinds', () => {
    it('should identify instance kind as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.myInstance', kind: 'instance' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify class kind as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.MyClass', kind: 'class' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should not identify theorem kind as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.myTheorem', kind: 'theorem' })
      expect(isTechnicalNode(node)).toBe(false)
    })

    it('should not identify definition kind as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.myDef', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(false)
    })
  })

  describe('inst prefix patterns', () => {
    it('should identify names starting with inst as technical', () => {
      const node = createNode({ id: '1', name: 'instDecidableEq', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify names containing .inst as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.instRepr', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should not identify names containing inst in middle', () => {
      const node = createNode({ id: '1', name: 'MyModule.instrument', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(false)
    })
  })

  describe('coercion patterns', () => {
    it('should identify _of_ coercions as technical', () => {
      const node = createNode({ id: '1', name: 'Int_of_Nat', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify .of_ coercions as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.of_something', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify _to_ conversions as technical', () => {
      const node = createNode({ id: '1', name: 'Nat_to_Int', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify .to_ conversions as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.to_string', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })
  })

  describe('auto-generated names', () => {
    it('should identify names starting with underscore as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule._private', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify numeric suffix names as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.auto.123', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })
  })

  describe('Decidable patterns', () => {
    it('should identify Decidable as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.DecidableEq', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify decidable (lowercase) as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.decidable_of_bool', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })
  })

  describe('type class projections', () => {
    it('should identify mk as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.mk', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should identify mk1 as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.mk1', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(true)
    })

    it('should not identify mkSomething as technical', () => {
      const node = createNode({ id: '1', name: 'MyModule.mkSomething', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(false)
    })
  })

  describe('non-technical nodes', () => {
    it('should not identify regular theorems as technical', () => {
      const node = createNode({ id: '1', name: 'IChing.Hexagram.complement_involutive', kind: 'theorem' })
      expect(isTechnicalNode(node)).toBe(false)
    })

    it('should not identify regular lemmas as technical', () => {
      const node = createNode({ id: '1', name: 'Nat.add_comm', kind: 'lemma' })
      expect(isTechnicalNode(node)).toBe(false)
    })

    it('should not identify regular definitions as technical', () => {
      const node = createNode({ id: '1', name: 'List.map', kind: 'definition' })
      expect(isTechnicalNode(node)).toBe(false)
    })
  })
})

// ============================================
// processGraph Tests
// ============================================

describe('processGraph', () => {
  describe('with hideTechnical: false', () => {
    it('should return nodes and edges unchanged', () => {
      const nodes = [
        createNode({ id: '1', name: 'Theorem1', kind: 'theorem' }),
        createNode({ id: '2', name: 'instDecidable', kind: 'instance' }),
      ]
      const edges = [createEdge('1', '2')]

      const result = processGraph(nodes, edges, { hideTechnical: false, hideOrphaned: true })

      expect(result.nodes).toHaveLength(2)
      expect(result.edges).toHaveLength(1)
      expect(result.stats.removedNodes).toBe(0)
      expect(result.stats.virtualEdgesCreated).toBe(0)
      expect(result.stats.orphanedNodes).toBe(0)
    })
  })

  describe('with hideTechnical: true', () => {
    it('should remove technical nodes', () => {
      const nodes = [
        createNode({ id: '1', name: 'Theorem1', kind: 'theorem' }),
        createNode({ id: '2', name: 'instDecidable', kind: 'instance' }),
        createNode({ id: '3', name: 'Definition1', kind: 'definition' }),
      ]
      // Add an edge so nodes aren't orphaned
      const edges = [createEdge('1', '3')]

      const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

      expect(result.nodes).toHaveLength(2)
      expect(result.nodes.map(n => n.id)).toEqual(['1', '3'])
      expect(result.stats.removedNodes).toBe(1)
    })

    it('should remove edges connected to technical nodes', () => {
      const nodes = [
        createNode({ id: '1', name: 'Theorem1', kind: 'theorem' }),
        createNode({ id: '2', name: 'instDecidable', kind: 'instance' }),
        createNode({ id: '3', name: 'OtherTheorem', kind: 'theorem' }),
      ]
      // Add a real connection between non-technical nodes
      const edges = [createEdge('1', '2'), createEdge('1', '3')]

      const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

      // Should only have the edge between non-technical nodes
      expect(result.edges).toHaveLength(1)
      expect(result.edges[0].source).toBe('1')
      expect(result.edges[0].target).toBe('3')
    })

    describe('through-links (graph contraction)', () => {
      it('should create virtual edge when hiding intermediate node', () => {
        // A -> T -> B  =>  A -> B (virtual)
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T', name: 'instTechnical', kind: 'instance' }),
          createNode({ id: 'B', name: 'DefinitionB', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T'),
          createEdge('T', 'B'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(2)
        expect(result.nodes.map(n => n.id)).toEqual(['A', 'B'])

        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('B')
        expect(result.edges[0].id).toContain('virtual')
        expect(result.edges[0].style).toBe('glow')
        expect(result.edges[0].fromLean).toBe(false)

        expect(result.stats.virtualEdgesCreated).toBe(1)
      })

      it('should create multiple virtual edges for fan-out pattern', () => {
        // A -> T -> B
        //      T -> C
        // =>  A -> B, A -> C
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T', name: 'instTechnical', kind: 'instance' }),
          createNode({ id: 'B', name: 'DefB', kind: 'definition' }),
          createNode({ id: 'C', name: 'DefC', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T'),
          createEdge('T', 'B'),
          createEdge('T', 'C'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(3)
        expect(result.edges).toHaveLength(2)
        expect(result.stats.virtualEdgesCreated).toBe(2)

        const virtualEdges = result.edges.filter(e => e.id.startsWith('virtual'))
        expect(virtualEdges).toHaveLength(2)

        const targets = virtualEdges.map(e => e.target).sort()
        expect(targets).toEqual(['B', 'C'])
      })

      it('should create multiple virtual edges for fan-in pattern', () => {
        // A -> T -> C
        // B -> T
        // =>  A -> C, B -> C
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'B', name: 'TheoremB', kind: 'theorem' }),
          createNode({ id: 'T', name: 'instTechnical', kind: 'instance' }),
          createNode({ id: 'C', name: 'DefC', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T'),
          createEdge('B', 'T'),
          createEdge('T', 'C'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(3)
        expect(result.edges).toHaveLength(2)
        expect(result.stats.virtualEdgesCreated).toBe(2)

        const sources = result.edges.map(e => e.source).sort()
        expect(sources).toEqual(['A', 'B'])
      })

      it('should not create self-loops', () => {
        // A -> T -> A (should not create A -> A)
        // With hideOrphaned, A will be removed since it has no edges
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T', name: 'instTechnical', kind: 'instance' }),
        ]
        const edges = [
          createEdge('A', 'T'),
          createEdge('T', 'A'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: false })

        expect(result.edges).toHaveLength(0)
        expect(result.stats.virtualEdgesCreated).toBe(0)
      })

      it('should not create duplicate virtual edges', () => {
        // A -> T1 -> B
        // A -> T2 -> B
        // => Only one A -> B
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T1', name: 'instTech1', kind: 'instance' }),
          createNode({ id: 'T2', name: 'instTech2', kind: 'instance' }),
          createNode({ id: 'B', name: 'DefB', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T1'),
          createEdge('T1', 'B'),
          createEdge('A', 'T2'),
          createEdge('T2', 'B'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].source).toBe('A')
        expect(result.edges[0].target).toBe('B')
      })

      it('should not create virtual edge if real edge already exists', () => {
        // A -> T -> B
        // A -> B (direct)
        // => Only keep A -> B (direct), no virtual
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T', name: 'instTechnical', kind: 'instance' }),
          createNode({ id: 'B', name: 'DefB', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T'),
          createEdge('T', 'B'),
          createEdge('A', 'B'),  // Direct edge
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.edges).toHaveLength(1)
        expect(result.edges[0].id).toBe('A->B')  // Original, not virtual
        expect(result.stats.virtualEdgesCreated).toBe(0)
      })

      it('should handle chain of technical nodes', () => {
        // A -> T1 -> T2 -> B
        // Only T1's through-links to non-technical nodes are created
        // T2's incoming is T1 (technical), so no through-link from A
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T1', name: 'instTech1', kind: 'instance' }),
          createNode({ id: 'T2', name: 'instTech2', kind: 'instance' }),
          createNode({ id: 'B', name: 'DefB', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T1'),
          createEdge('T1', 'T2'),
          createEdge('T2', 'B'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: false })

        // A and B remain (with hideOrphaned: false)
        expect(result.nodes).toHaveLength(2)
        // No through-links because T1's output goes to T2 (also technical)
        // and T2's input comes from T1 (also technical)
        expect(result.edges).toHaveLength(0)
      })

      it('should handle mixed technical and non-technical connections', () => {
        // A -> T -> B
        // A -> C (direct)
        // T -> D
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'T', name: 'instTech', kind: 'instance' }),
          createNode({ id: 'B', name: 'DefB', kind: 'definition' }),
          createNode({ id: 'C', name: 'DefC', kind: 'definition' }),
          createNode({ id: 'D', name: 'DefD', kind: 'definition' }),
        ]
        const edges = [
          createEdge('A', 'T'),
          createEdge('T', 'B'),
          createEdge('A', 'C'),
          createEdge('T', 'D'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(4)  // A, B, C, D
        expect(result.edges).toHaveLength(3)  // A->C (real), A->B (virtual), A->D (virtual)

        const realEdges = result.edges.filter(e => !e.id.startsWith('virtual'))
        const virtualEdges = result.edges.filter(e => e.id.startsWith('virtual'))

        expect(realEdges).toHaveLength(1)
        expect(realEdges[0].id).toBe('A->C')

        expect(virtualEdges).toHaveLength(2)
      })
    })

    it('should handle empty graph', () => {
      const result = processGraph([], [], { hideTechnical: true, hideOrphaned: true })

      expect(result.nodes).toHaveLength(0)
      expect(result.edges).toHaveLength(0)
      expect(result.stats.removedNodes).toBe(0)
      expect(result.stats.orphanedNodes).toBe(0)
    })

    it('should handle graph with no technical nodes', () => {
      const nodes = [
        createNode({ id: '1', name: 'Theorem1', kind: 'theorem' }),
        createNode({ id: '2', name: 'Definition1', kind: 'definition' }),
      ]
      const edges = [createEdge('1', '2')]

      const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

      expect(result.nodes).toHaveLength(2)
      expect(result.edges).toHaveLength(1)
      expect(result.stats.removedNodes).toBe(0)
      expect(result.stats.orphanedNodes).toBe(0)
    })

    describe('orphaned node removal', () => {
      it('should remove nodes that become orphaned after filtering', () => {
        // apply_one -> instMulAction (no outgoing from instance)
        // With hideOrphaned: true, apply_one should be removed
        const nodes = [
          createNode({ id: 'apply_one', name: 'IChing.apply_one', kind: 'theorem' }),
          createNode({ id: 'inst', name: 'instMulActionHexagram', kind: 'instance' }),
        ]
        const edges = [
          createEdge('apply_one', 'inst'),  // apply_one uses the instance
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(0)  // Both removed (inst is technical, apply_one becomes orphaned)
        expect(result.edges).toHaveLength(0)
        expect(result.stats.removedNodes).toBe(1)  // inst removed as technical
        expect(result.stats.orphanedNodes).toBe(1)  // apply_one removed as orphaned
      })

      it('should keep orphaned nodes when hideOrphaned is false', () => {
        const nodes = [
          createNode({ id: 'apply_one', name: 'IChing.apply_one', kind: 'theorem' }),
          createNode({ id: 'inst', name: 'instMulActionHexagram', kind: 'instance' }),
        ]
        const edges = [
          createEdge('apply_one', 'inst'),
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: false })

        expect(result.nodes).toHaveLength(1)  // apply_one kept
        expect(result.nodes[0].id).toBe('apply_one')
        expect(result.stats.orphanedNodes).toBe(0)
      })

      it('should not remove nodes that still have connections after filtering', () => {
        const nodes = [
          createNode({ id: 'theorem1', name: 'Theorem1', kind: 'theorem' }),
          createNode({ id: 'inst', name: 'instSomething', kind: 'instance' }),
          createNode({ id: 'def1', name: 'Definition1', kind: 'definition' }),
        ]
        const edges = [
          createEdge('theorem1', 'inst'),
          createEdge('inst', 'def1'),  // through-link will be created
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(2)  // theorem1 and def1
        expect(result.nodes.map(n => n.id).sort()).toEqual(['def1', 'theorem1'])
        expect(result.edges).toHaveLength(1)  // virtual edge theorem1 -> def1
        expect(result.stats.orphanedNodes).toBe(0)
      })

      it('should handle multiple orphaned nodes', () => {
        // Multiple nodes only connect to the same instance
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'B', name: 'TheoremB', kind: 'theorem' }),
          createNode({ id: 'C', name: 'TheoremC', kind: 'theorem' }),
          createNode({ id: 'inst', name: 'instTech', kind: 'instance' }),
        ]
        const edges = [
          createEdge('A', 'inst'),
          createEdge('B', 'inst'),
          createEdge('C', 'inst'),
          // No outgoing edges from inst
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(0)
        expect(result.stats.orphanedNodes).toBe(3)  // A, B, C all orphaned
      })

      it('should keep nodes connected via through-links', () => {
        // A -> inst -> B
        // C -> inst -> B (C also gets a through-link to B!)
        // All nodes should be kept (A, B, C connected via through-links)
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'B', name: 'DefB', kind: 'definition' }),
          createNode({ id: 'C', name: 'TheoremC', kind: 'theorem' }),
          createNode({ id: 'inst', name: 'instTech', kind: 'instance' }),
        ]
        const edges = [
          createEdge('A', 'inst'),
          createEdge('inst', 'B'),
          createEdge('C', 'inst'),  // C -> inst -> B creates C -> B through-link
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        // All non-technical nodes kept - both A and C get through-links to B
        expect(result.nodes).toHaveLength(3)  // A, B, C
        expect(result.nodes.map(n => n.id).sort()).toEqual(['A', 'B', 'C'])
        expect(result.edges).toHaveLength(2)  // A -> B and C -> B
        expect(result.stats.orphanedNodes).toBe(0)
      })

      it('should orphan nodes that only connect TO an instance with no outgoing', () => {
        // A -> inst1 (no outgoing from inst1)
        // B -> inst1
        // A and B become orphaned
        const nodes = [
          createNode({ id: 'A', name: 'TheoremA', kind: 'theorem' }),
          createNode({ id: 'B', name: 'TheoremB', kind: 'theorem' }),
          createNode({ id: 'inst1', name: 'instTech1', kind: 'instance' }),
        ]
        const edges = [
          createEdge('A', 'inst1'),
          createEdge('B', 'inst1'),
          // No outgoing from inst1, so no through-links possible
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.nodes).toHaveLength(0)
        expect(result.stats.orphanedNodes).toBe(2)  // A and B
      })

      it('should correctly count orphaned nodes in stats', () => {
        // Scenario: inst1 has no outgoing, inst2 has outgoing
        // 1 -> inst1 (orphaned - no through-link possible)
        // 2 -> inst1 (orphaned - no through-link possible)
        // 4 -> inst2 -> 5 (connected via through-link)
        const nodes = [
          createNode({ id: '1', name: 'Orphan1', kind: 'theorem' }),
          createNode({ id: '2', name: 'Orphan2', kind: 'theorem' }),
          createNode({ id: 'inst1', name: 'instTech1', kind: 'instance' }),
          createNode({ id: '4', name: 'Connected1', kind: 'theorem' }),
          createNode({ id: '5', name: 'Connected2', kind: 'definition' }),
          createNode({ id: 'inst2', name: 'instTech2', kind: 'instance' }),
        ]
        const edges = [
          createEdge('1', 'inst1'),  // Will be orphaned (no outgoing from inst1)
          createEdge('2', 'inst1'),  // Will be orphaned (no outgoing from inst1)
          createEdge('4', 'inst2'),
          createEdge('inst2', '5'),  // Through-link: 4 -> 5
        ]

        const result = processGraph(nodes, edges, { hideTechnical: true, hideOrphaned: true })

        expect(result.stats.removedNodes).toBe(2)  // inst1 and inst2
        expect(result.stats.orphanedNodes).toBe(2)  // 1 and 2
        expect(result.stats.virtualEdgesCreated).toBe(1)  // 4 -> 5
        expect(result.nodes).toHaveLength(2)  // 4 and 5
      })
    })
  })
})

// ============================================
// getTechnicalNodeIds Tests
// ============================================

describe('getTechnicalNodeIds', () => {
  it('should return set of technical node IDs', () => {
    const nodes = [
      createNode({ id: '1', name: 'Theorem1', kind: 'theorem' }),
      createNode({ id: '2', name: 'instDecidable', kind: 'instance' }),
      createNode({ id: '3', name: 'Definition1', kind: 'definition' }),
      createNode({ id: '4', name: 'MyClass', kind: 'class' }),
    ]

    const technicalIds = getTechnicalNodeIds(nodes)

    expect(technicalIds.size).toBe(2)
    expect(technicalIds.has('2')).toBe(true)
    expect(technicalIds.has('4')).toBe(true)
    expect(technicalIds.has('1')).toBe(false)
    expect(technicalIds.has('3')).toBe(false)
  })

  it('should return empty set for no technical nodes', () => {
    const nodes = [
      createNode({ id: '1', name: 'Theorem1', kind: 'theorem' }),
      createNode({ id: '2', name: 'Definition1', kind: 'definition' }),
    ]

    const technicalIds = getTechnicalNodeIds(nodes)

    expect(technicalIds.size).toBe(0)
  })
})

// ============================================
// DEFAULT_FILTER_OPTIONS Tests
// ============================================

describe('DEFAULT_FILTER_OPTIONS', () => {
  it('should have hideTechnical set to false by default', () => {
    expect(DEFAULT_FILTER_OPTIONS.hideTechnical).toBe(false)
  })

  it('should have hideOrphaned set to false by default', () => {
    expect(DEFAULT_FILTER_OPTIONS.hideOrphaned).toBe(false)
  })
})

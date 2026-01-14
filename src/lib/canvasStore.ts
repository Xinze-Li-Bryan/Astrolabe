/**
 * Canvas Store - Canvas state management
 *
 * Manages user canvas: which nodes to display, custom nodes/edges, positions
 */

import { create } from 'zustand'

const API_BASE = 'http://127.0.0.1:8765'

/**
 * Detect if adding a new edge would create a cycle in the graph
 * Uses DFS to check if there's a path from target to source
 */
function wouldCreateCycle(
  edges: { source: string; target: string }[],
  newSource: string,
  newTarget: string
): boolean {
  // Build adjacency list
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, [])
    }
    adjacency.get(edge.source)!.push(edge.target)
  }

  // Add the new edge temporarily
  if (!adjacency.has(newSource)) {
    adjacency.set(newSource, [])
  }
  adjacency.get(newSource)!.push(newTarget)

  // DFS to check if there's a path from newTarget back to newSource
  const visited = new Set<string>()
  const stack = [newTarget]

  while (stack.length > 0) {
    const node = stack.pop()!
    if (node === newSource) {
      return true // Found a cycle
    }
    if (visited.has(node)) continue
    visited.add(node)

    const neighbors = adjacency.get(node) || []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        stack.push(neighbor)
      }
    }
  }

  return false
}

export interface SearchResult {
  id: string
  name: string
  kind: string
  filePath: string
  lineNumber: number
  status: string
  dependsOnCount: number
  usedByCount: number
  depth: number
}

export interface NodeDeps {
  nodeId: string
  dependsOn: { id: string; name: string; kind: string }[]
  usedBy: { id: string; name: string; kind: string }[]
}

// Custom node type (data saved in meta.json, canvas visibility controlled by visibleNodes[])
export interface CustomNode {
  id: string
  name: string
  kind: 'custom'
  notes?: string
  effect?: string
  size?: number
  color?: string
}

// Custom edge type
export interface CustomEdge {
  id: string
  source: string
  target: string
  notes?: string
  style?: string
  effect?: string
  width?: number
  color?: string
}

// 3D position type
export interface Position3D {
  x: number
  y: number
  z: number
}

interface CanvasState {
  // Current project path
  projectPath: string | null

  // Canvas state
  visibleNodes: string[]  // Displayed ilean node IDs
  customNodes: CustomNode[]      // User-defined nodes
  customEdges: CustomEdge[]      // User-defined edges
  positions: Record<string, Position3D>  // 3D positions {x, y, z}
  positionsLoaded: boolean  // Whether positions have been loaded from backend

  // Search
  searchQuery: string
  searchResults: SearchResult[]
  isSearching: boolean

  // Operations
  setProjectPath: (path: string) => void
  loadCanvas: () => Promise<void>
  saveCanvas: () => Promise<void>

  addNode: (nodeId: string) => Promise<void>
  removeNode: (nodeId: string) => Promise<void>
  clearCanvas: () => Promise<void>

  updatePosition: (nodeId: string, x: number, y: number, z: number) => void
  updatePositions: (positions: Record<string, Position3D>) => Promise<void>

  search: (query: string) => Promise<void>
  setSearchQuery: (query: string) => void

  getNodeDeps: (nodeId: string) => Promise<NodeDeps | null>
  addNodeWithDeps: (nodeId: string) => Promise<void>
  addNodes: (nodeIds: string[]) => Promise<void>

  // Custom node/edge operations
  addCustomNode: (id: string, name: string) => Promise<CustomNode | null>
  updateCustomNode: (nodeId: string, updates: Partial<CustomNode>) => Promise<void>
  removeCustomNode: (nodeId: string) => Promise<void>
  addCustomEdge: (source: string, target: string, allEdges?: { source: string; target: string }[]) => Promise<{ edge: CustomEdge | null; error?: string }>
  removeCustomEdge: (edgeId: string) => Promise<void>

  // Unified node deletion (delete meta + remove from canvas)
  deleteNodeWithMeta: (nodeId: string) => Promise<void>

  // Reset all data (canvas + meta) - destructive operation
  resetAllData: () => Promise<void>
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  projectPath: null,
  visibleNodes: [],
  customNodes: [],
  customEdges: [],
  positions: {},
  positionsLoaded: false,
  searchQuery: '',
  searchResults: [],
  isSearching: false,

  setProjectPath: (path) => set({ projectPath: path, positionsLoaded: false }),

  loadCanvas: async () => {
    const { projectPath } = get()
    if (!projectPath) return

    try {
      // Load canvas, user_nodes, user_edges in parallel
      const [canvasRes, customNodesRes, customEdgesRes] = await Promise.all([
        fetch(`${API_BASE}/api/canvas?path=${encodeURIComponent(projectPath)}`),
        fetch(`${API_BASE}/api/project/user-nodes?path=${encodeURIComponent(projectPath)}`),
        fetch(`${API_BASE}/api/project/user-edges?path=${encodeURIComponent(projectPath)}`),
      ])

      if (!canvasRes.ok) throw new Error('Failed to load canvas')

      const canvasData = await canvasRes.json()
      const customNodesData = customNodesRes.ok ? await customNodesRes.json() : { nodes: [] }
      const customEdgesData = customEdgesRes.ok ? await customEdgesRes.json() : { edges: [] }

      set({
        visibleNodes: canvasData.visible_nodes || [],
        customNodes: customNodesData.nodes || [],
        customEdges: customEdgesData.edges || [],
        positions: canvasData.positions || {},
        positionsLoaded: true,
      })
      console.log('[CanvasStore] Loaded canvas:', canvasData.visible_nodes?.length || 0, 'nodes,', customNodesData.nodes?.length || 0, 'custom nodes,', customEdgesData.edges?.length || 0, 'custom edges,', Object.keys(canvasData.positions || {}).length, 'positions')
    } catch (e) {
      console.error('[CanvasStore] Load failed:', e)
      set({ positionsLoaded: true })  // Mark as loaded even on error to prevent infinite loading
    }
  },

  saveCanvas: async () => {
    const { projectPath, visibleNodes, positions } = get()
    if (!projectPath) return

    try {
      // custom_nodes and custom_edges are no longer saved to canvas (they exist in meta.json)
      await fetch(`${API_BASE}/api/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: projectPath,
          visible_nodes: visibleNodes,
          positions,
        }),
      })
      console.log('[CanvasStore] Saved canvas')
    } catch (e) {
      console.error('[CanvasStore] Save failed:', e)
    }
  },

  addNode: async (nodeId) => {
    const { projectPath, visibleNodes } = get()
    if (!projectPath || visibleNodes.includes(nodeId)) return

    try {
      const res = await fetch(`${API_BASE}/api/canvas/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, node_id: nodeId }),
      })

      if (!res.ok) throw new Error('Failed to add node')

      const data = await res.json()
      set({
        visibleNodes: data.visible_nodes || [],
        positions: data.positions || {},
      })
      console.log('[CanvasStore] Added node:', nodeId)
    } catch (e) {
      console.error('[CanvasStore] Add node failed:', e)
    }
  },

  removeNode: async (nodeId) => {
    const { projectPath } = get()
    if (!projectPath) return

    try {
      const res = await fetch(`${API_BASE}/api/canvas/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, node_id: nodeId }),
      })

      if (!res.ok) throw new Error('Failed to remove node')

      const data = await res.json()
      set({
        visibleNodes: data.visible_nodes || [],
        positions: data.positions || {},
      })
      console.log('[CanvasStore] Removed node:', nodeId)
    } catch (e) {
      console.error('[CanvasStore] Remove node failed:', e)
    }
  },

  clearCanvas: async () => {
    const { projectPath } = get()
    if (!projectPath) return

    try {
      await fetch(`${API_BASE}/api/canvas/clear?path=${encodeURIComponent(projectPath)}`, {
        method: 'POST',
      })

      set({
        visibleNodes: [],
        customNodes: [],
        customEdges: [],
        positions: {},
      })
      console.log('[CanvasStore] Cleared canvas')
    } catch (e) {
      console.error('[CanvasStore] Clear failed:', e)
    }
  },

  updatePosition: (nodeId, x, y, z) => {
    set((state) => ({
      positions: { ...state.positions, [nodeId]: { x, y, z } },
    }))
  },

  updatePositions: async (positions) => {
    const { projectPath } = get()
    if (!projectPath) return

    // Update locally
    set((state) => ({
      positions: { ...state.positions, ...positions },
    }))

    // Save to backend
    try {
      await fetch(`${API_BASE}/api/canvas/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, positions }),
      })
    } catch (e) {
      console.error('[CanvasStore] Update positions failed:', e)
    }
  },

  search: async (query) => {
    const { projectPath } = get()
    if (!projectPath) {
      set({ searchResults: [], isSearching: false })
      return
    }

    set({ isSearching: true, searchQuery: query })

    try {
      // Get all nodes for empty query, otherwise search
      const url = query.trim()
        ? `${API_BASE}/api/project/search?path=${encodeURIComponent(projectPath)}&q=${encodeURIComponent(query)}&limit=100`
        : `${API_BASE}/api/project/search?path=${encodeURIComponent(projectPath)}&q=&limit=10000`

      const res = await fetch(url)

      if (!res.ok) throw new Error('Search failed')

      const data = await res.json()
      set({
        searchResults: data.results.map((r: any) => ({
          id: r.id,
          name: r.name,
          kind: r.kind,
          filePath: r.filePath,
          lineNumber: r.lineNumber,
          status: r.status,
          dependsOnCount: r.dependsOnCount ?? 0,
          usedByCount: r.usedByCount ?? 0,
          depth: r.depth ?? 0,
        })),
        isSearching: false,
      })
    } catch (e) {
      console.error('[CanvasStore] Search failed:', e)
      set({ searchResults: [], isSearching: false })
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  getNodeDeps: async (nodeId) => {
    const { projectPath } = get()
    if (!projectPath) return null

    try {
      const res = await fetch(
        `${API_BASE}/api/project/node/${encodeURIComponent(nodeId)}/deps?path=${encodeURIComponent(projectPath)}`
      )

      if (!res.ok) return null

      const data = await res.json()
      return {
        nodeId: data.node_id,
        dependsOn: data.depends_on || [],
        usedBy: data.used_by || [],
      }
    } catch (e) {
      console.error('[CanvasStore] Get deps failed:', e)
      return null
    }
  },

  addNodeWithDeps: async (nodeId) => {
    const { addNode, getNodeDeps } = get()

    // Add main node first
    await addNode(nodeId)

    // Get dependencies and add them
    const deps = await getNodeDeps(nodeId)
    if (deps) {
      // Add dependent nodes
      for (const dep of deps.dependsOn) {
        await addNode(dep.id)
      }
      // Add nodes that use this node
      for (const user of deps.usedBy) {
        await addNode(user.id)
      }
    }
  },

  // Batch add multiple nodes to canvas
  addNodes: async (nodeIds: string[]) => {
    const { projectPath, visibleNodes } = get()
    if (!projectPath) return

    // Filter out nodes already on canvas
    const newNodeIds = nodeIds.filter(id => !visibleNodes.includes(id))
    if (newNodeIds.length === 0) return

    try {
      const res = await fetch(`${API_BASE}/api/canvas/add-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, node_ids: newNodeIds }),
      })

      if (!res.ok) throw new Error('Failed to add nodes')

      const data = await res.json()
      set({
        visibleNodes: data.visible_nodes || [],
        positions: data.positions || {},
      })
      console.log('[CanvasStore] Added nodes:', newNodeIds.length)
    } catch (e) {
      console.error('[CanvasStore] Add nodes failed:', e)
    }
  },

  // ============================================
  // Custom node/edge operations
  // ============================================

  addCustomNode: async (id, name) => {
    const { projectPath, customNodes, addNode } = get()
    if (!projectPath) return null

    try {
      const res = await fetch(`${API_BASE}/api/project/user-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, node_id: id, name, kind: 'custom' }),
      })

      if (!res.ok) {
        const error = await res.json()
        console.error('[CanvasStore] Add custom node failed:', error)
        return null
      }

      const data = await res.json()
      // New API returns node object directly
      const newNode: CustomNode = {
        id: data.node.id,
        name: data.node.name,
        kind: 'custom' as const,
        notes: data.node.notes,
        effect: data.node.effect,
        size: data.node.size,
        color: data.node.color,
      }
      set({ customNodes: [...customNodes, newNode] })

      // Automatically add to canvas visibleNodes[]
      await addNode(newNode.id)
      console.log('[CanvasStore] Added custom node to canvas:', id)

      return newNode
    } catch (e) {
      console.error('[CanvasStore] Add custom node failed:', e)
      return null
    }
  },

  updateCustomNode: async (nodeId, updates) => {
    const { projectPath, customNodes } = get()
    if (!projectPath) return

    try {
      const res = await fetch(`${API_BASE}/api/project/user-node/${encodeURIComponent(nodeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, ...updates }),
      })

      if (!res.ok) throw new Error('Failed to update custom node')

      const data = await res.json()
      // Update local state (visibility controlled by visibleNodes[], not updated here)
      const updatedNodes = customNodes.map(node =>
        node.id === nodeId
          ? {
              ...node,
              name: data.node?.name ?? node.name,
              notes: data.node?.notes ?? node.notes,
              effect: data.node?.effect ?? node.effect,
              size: data.node?.size ?? node.size,
              color: data.node?.color ?? node.color,
            }
          : node
      )
      set({ customNodes: updatedNodes })
      console.log('[CanvasStore] Updated custom node:', nodeId)
    } catch (e) {
      console.error('[CanvasStore] Update custom node failed:', e)
    }
  },

  removeCustomNode: async (nodeId) => {
    const { projectPath, customNodes, customEdges } = get()
    if (!projectPath) return

    try {
      const res = await fetch(
        `${API_BASE}/api/project/user-node/${encodeURIComponent(nodeId)}?path=${encodeURIComponent(projectPath)}`,
        { method: 'DELETE' }
      )

      if (!res.ok) throw new Error('Failed to remove custom node')

      // Delete node locally
      const filteredNodes = customNodes.filter(node => node.id !== nodeId)
      // Cascade delete related edges
      const filteredEdges = customEdges.filter(edge => edge.source !== nodeId && edge.target !== nodeId)
      set({ customNodes: filteredNodes, customEdges: filteredEdges })
      console.log('[CanvasStore] Removed custom node:', nodeId)
    } catch (e) {
      console.error('[CanvasStore] Remove custom node failed:', e)
    }
  },

  addCustomEdge: async (source, target, allEdges) => {
    const { projectPath, customEdges } = get()
    if (!projectPath) return { edge: null, error: 'No project loaded' }

    // Check for cycle if allEdges provided
    if (allEdges) {
      // Combine all edges (Lean + custom) for cycle detection
      const combinedEdges = [
        ...allEdges,
        ...customEdges.map(e => ({ source: e.source, target: e.target }))
      ]

      if (wouldCreateCycle(combinedEdges, source, target)) {
        console.warn('[CanvasStore] Blocked edge creation: would create cycle', source, '->', target)
        return { edge: null, error: 'Cannot create edge: this would create a circular dependency' }
      }
    }

    try {
      const res = await fetch(`${API_BASE}/api/project/user-edge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: projectPath, source, target }),
      })

      if (!res.ok) {
        const error = await res.json()
        console.error('[CanvasStore] Add custom edge failed:', error)
        return { edge: null, error: error.detail || 'Failed to create edge' }
      }

      const data = await res.json()
      // New API returns edge object directly
      const newEdge: CustomEdge = {
        id: data.edge.id,
        source: data.edge.source,
        target: data.edge.target,
        notes: data.edge.notes,
        style: data.edge.style,
        effect: data.edge.effect,
        width: data.edge.width,
        color: data.edge.color,
      }
      set({ customEdges: [...customEdges, newEdge] })
      console.log('[CanvasStore] Added custom edge:', newEdge.id)

      return { edge: newEdge }
    } catch (e) {
      console.error('[CanvasStore] Add custom edge failed:', e)
      return { edge: null, error: 'Failed to create edge' }
    }
  },

  removeCustomEdge: async (edgeId) => {
    const { projectPath, customEdges } = get()
    if (!projectPath) return

    try {
      const res = await fetch(
        `${API_BASE}/api/project/user-edge/${encodeURIComponent(edgeId)}?path=${encodeURIComponent(projectPath)}`,
        { method: 'DELETE' }
      )

      if (!res.ok) throw new Error('Failed to remove custom edge')

      // Delete edge locally
      const filteredEdges = customEdges.filter(edge => edge.id !== edgeId)
      set({ customEdges: filteredEdges })
      console.log('[CanvasStore] Removed custom edge:', edgeId)
    } catch (e) {
      console.error('[CanvasStore] Remove custom edge failed:', e)
    }
  },

  // Unified node deletion: delete meta + remove from canvas
  // Handles all node types uniformly (custom and Lean nodes)
  deleteNodeWithMeta: async (nodeId) => {
    const { projectPath, removeNode, customNodes, customEdges } = get()
    if (!projectPath) return

    try {
      // 1. Delete node's meta information
      await fetch(
        `${API_BASE}/api/project/node/${encodeURIComponent(nodeId)}/meta?path=${encodeURIComponent(projectPath)}`,
        { method: 'DELETE' }
      )
      console.log('[CanvasStore] Deleted node meta:', nodeId)

      // 2. If it's a custom node, also delete the node itself
      const isCustomNode = nodeId.startsWith('custom-') || customNodes.some(n => n.id === nodeId)
      if (isCustomNode) {
        await fetch(
          `${API_BASE}/api/project/user-node/${encodeURIComponent(nodeId)}?path=${encodeURIComponent(projectPath)}`,
          { method: 'DELETE' }
        )
        // Delete custom node and related edges locally
        const filteredNodes = customNodes.filter(node => node.id !== nodeId)
        const filteredEdges = customEdges.filter(edge => edge.source !== nodeId && edge.target !== nodeId)
        set({ customNodes: filteredNodes, customEdges: filteredEdges })
        console.log('[CanvasStore] Deleted custom node:', nodeId)
      }

      // 3. Remove from canvas
      await removeNode(nodeId)
      console.log('[CanvasStore] Deleted node with meta:', nodeId)
    } catch (e) {
      console.error('[CanvasStore] Delete node with meta failed:', e)
    }
  },

  resetAllData: async () => {
    const { projectPath } = get()
    if (!projectPath) return

    try {
      // Delete entire .astrolabe directory, forcing re-parse from .ilean
      await fetch(`${API_BASE}/api/reset?path=${encodeURIComponent(projectPath)}`, {
        method: 'POST',
      })

      set({
        visibleNodes: [],
        customNodes: [],
        customEdges: [],
        positions: {},
      })
      console.log('[CanvasStore] Reset all data (deleted .astrolabe, will re-parse on reload)')
    } catch (e) {
      console.error('[CanvasStore] Reset all data failed:', e)
    }
  },
}))

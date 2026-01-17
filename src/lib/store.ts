/**
 * Zustand Store - UI state management only
 *
 * Data comes from backend API, used directly without transformation
 * Types are uniformly imported from @/types/node
 */

import { create } from 'zustand'
import type { Node, Edge, NodeMeta, EdgeMeta, ProjectData, ProjectStats, ProjectStatus } from '@/types/node'
import { loadProject as apiLoadProject, checkProjectStatus } from '@/lib/api'

// Re-export types for use by other modules
export type { Node, Edge, NodeMeta, EdgeMeta, ProjectData, ProjectStats, ProjectStatus }

// ============================================
// UI State
// ============================================

export type ViewMode = '2d' | '3d'

interface UIState {
  // Project
  projectPath: string | null
  projectData: ProjectData | null
  projectStatus: ProjectStatus | null
  loading: boolean
  error: string | null

  // UI
  selectedNodeId: string | null
  viewMode: ViewMode
  infoPanelOpen: boolean
  searchPanelOpen: boolean

  // Methods
  loadProject: (path: string) => Promise<void>
  checkStatus: (path: string) => Promise<ProjectStatus | null>
  selectNode: (id: string | null) => void
  setViewMode: (mode: ViewMode) => void
  toggleInfoPanel: () => void
  toggleSearchPanel: () => void

  // Get the selected node object
  getSelectedNode: () => Node | null
}

// ============================================
// Store
// ============================================

export const useStore = create<UIState>((set, get) => ({
  // Initial state
  projectPath: null,
  projectData: null,
  projectStatus: null,
  loading: false,
  error: null,
  selectedNodeId: null,
  viewMode: '2d',
  infoPanelOpen: true,
  searchPanelOpen: true,

  // Check project status
  checkStatus: async (path: string) => {
    try {
      const status = await checkProjectStatus(path)
      set({ projectStatus: status })
      return status
    } catch (e) {
      console.error('[store] checkStatus failed:', e)
      return null
    }
  },

  // Load project
  loadProject: async (path: string) => {
    set({ loading: true, error: null, projectPath: path })

    try {
      // Check status first
      const status = await get().checkStatus(path)
      if (status?.needsInit || status?.notSupported) {
        set({ loading: false })
        return
      }

      // Load project data
      const data = await apiLoadProject(path)
      set({ projectData: data, loading: false })
      console.log(`[store] Loaded ${data.nodes.length} nodes, ${data.edges.length} edges`)

    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      set({ error: msg, loading: false })
      console.error('[store] loadProject failed:', msg)
    }
  },

  // Select node
  selectNode: (id) => set({ selectedNodeId: id }),

  // View mode
  setViewMode: (mode) => set({ viewMode: mode }),

  // Panel toggles
  toggleInfoPanel: () => set((s) => ({ infoPanelOpen: !s.infoPanelOpen })),
  toggleSearchPanel: () => set((s) => ({ searchPanelOpen: !s.searchPanelOpen })),

  // Get the selected node object
  getSelectedNode: () => {
    const { projectData, selectedNodeId } = get()
    if (!projectData || !selectedNodeId) return null
    return projectData.nodes.find((n) => n.id === selectedNodeId) || null
  },
}))

// ============================================
// Color Constants
// ============================================

// Consistent with assets/themes/default.json
export const KIND_COLORS: Record<string, string> = {
  theorem: '#A855F7',
  lemma: '#6366F1',
  definition: '#FBBF24',
  def: '#FBBF24',
  abbrev: '#FBBF24',
  opaque: '#FBBF24',
  proposition: '#A855F7',
  corollary: '#A855F7',
  axiom: '#FB923C',
  structure: '#2DD4BF',
  class: '#4ADE80',
  instance: '#38BDF8',
  inductive: '#F472B6',
  example: '#818CF8',
  custom: '#A1A1AA',  // Gray, consistent with canvas
  unknown: '#A1A1AA',
}

export const STATUS_COLORS: Record<string, string> = {
  proven: '#2ecc71',
  sorry: '#e67e22',
  error: '#e74c3c',
  unknown: '#95a5a6',
}

export function getNodeColor(node: Node): string {
  // Priority: backend default style > local KIND_COLORS fallback (user color override removed)
  const kindKey = node.kind.toLowerCase()
  const kindColor = KIND_COLORS[kindKey]
  if (node.defaultColor) {
    if (node.defaultColor !== '#888888' || !kindColor) {
      return node.defaultColor
    }
  }
  return kindColor || KIND_COLORS.unknown
}

export function getStatusColor(status: string): string {
  return STATUS_COLORS[status] || STATUS_COLORS.unknown
}

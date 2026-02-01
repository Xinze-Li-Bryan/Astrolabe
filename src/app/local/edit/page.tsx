'use client'

// Install global error handlers early to suppress known harmless errors (Monaco "Canceled", etc.)
import '@/lib/errorSuppression'

import { useState, useEffect, useCallback, Suspense, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
    HomeIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
    CodeBracketIcon,
    CubeIcon,
    SwatchIcon,
    PlusIcon,
    ArrowPathIcon,
    EyeIcon,
    EyeSlashIcon,
    TagIcon,
    ArrowLongRightIcon,
    ChevronDownIcon,
    ArrowsPointingOutIcon,
    TrashIcon,
    InformationCircleIcon,
    FunnelIcon,
    CubeTransparentIcon,
    BoltIcon,
    WrenchScrewdriverIcon,
    ChartBarIcon,
} from '@heroicons/react/24/outline'
import { useGraphData, type GraphNode } from '@/hooks/useGraphData'
import { getNamespaceDepthPreview, groupNodesByNamespace } from '@/lib/graphProcessing'
import { UIColors } from '@/lib/colors'
import { PROOF_STATUS_CONFIG, type ProofStatusType } from '@/lib/proofStatus'
import type { NodeKind, NodeStatus, AstrolabeNode, AstrolabeEdge } from '@/types/graph'
import NodeStylePanel from '@/components/NodeStylePanel'
import EdgeStylePanel from '@/components/EdgeStylePanel'
import { ProjectInitPanel } from '@/components/ProjectInitPanel'
import { SearchPanel } from '@/components/SearchPanel'
import { LeanCodePanel } from '@/components/LeanCodePanel'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { useCanvasStore, type SearchResult } from '@/lib/canvasStore'
import { calculateNodeStatusLines } from '@/lib/successLines'
import { readFile, readFullFile, updateNodeMeta, updateEdgeMeta, getViewport, updateViewport, getNamespaceIndex, buildNamespaceIndex, type FileContent, type ViewportData, type NamespaceLocation } from '@/lib/api'
import type { Node, Edge } from '@/lib/store'

// Dynamically import graph components
const SigmaGraph = dynamic(() => import('@/components/graph/SigmaGraph'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-white/40 bg-black">
            Loading 2D graph...
        </div>
    )
})

const ForceGraph3D = dynamic(() => import('@/components/graph3d/ForceGraph3D'), {
    ssr: false,
    loading: () => (
        <div className="h-full flex items-center justify-center text-white/40 bg-black">
            Loading 3D graph...
        </div>
    )
})

// Import physics types
import type { PhysicsParams } from '@/components/graph3d/ForceGraph3D'
import { DEFAULT_PHYSICS } from '@/components/graph3d/ForceLayout'

// Import lens components
import { LensPicker } from '@/components/LensPicker'
import { LensIndicator } from '@/components/LensIndicator'
import { useLensPickerShortcut } from '@/hooks/useLensPickerShortcut'
import { useLensStore } from '@/lib/lensStore'

// Import undo system
import { useUndoShortcut } from '@/hooks/useUndoShortcut'
import { graphActions } from '@/lib/history/graphActions'
import { viewportActions } from '@/lib/history/viewportActions'
import { useSelectionStore } from '@/lib/selectionStore'
import { highlightNamespaceUndoable, clearHighlightUndoable, selectNodeUndoable, selectEdgeUndoable } from '@/lib/history/selectionActions'


const getStatusLabel = (status: string) => {
    switch (status) {
        case 'proven': return 'Proven'
        case 'sorry': return 'Has sorry'
        case 'stated': return 'Stated only'
        default: return 'Unknown'
    }
}

const getTypeLabel = (type: string) => {
    return type.charAt(0).toUpperCase() + type.slice(1)
}

type ViewMode = '2d' | '3d'

function LocalEditorContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const projectPath = searchParams.get('path') || ''
    const projectName = projectPath.split('/').pop() || 'Project'

    // Suppress Monaco "Canceled" errors globally
    // These occur during unmount and are harmless
    useEffect(() => {
        const handleError = (event: ErrorEvent) => {
            if (event.message === 'Canceled' || event.error?.message === 'Canceled') {
                event.preventDefault()
                event.stopPropagation()
                return true
            }
        }
        const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
            if (event.reason?.message === 'Canceled' || event.reason?.name === 'Canceled') {
                event.preventDefault()
                return
            }
        }
        window.addEventListener('error', handleError, true)
        window.addEventListener('unhandledrejection', handleUnhandledRejection)
        return () => {
            window.removeEventListener('error', handleError, true)
            window.removeEventListener('unhandledrejection', handleUnhandledRejection)
        }
    }, [])

    const [isTauri, setIsTauri] = useState(false)
    const [infoPanelOpen, setInfoPanelOpen] = useState(true) // Node Info panel
    const [searchPanelOpen, setSearchPanelOpen] = useState(true) // Left search panel
    const [searchPanelKey, setSearchPanelKey] = useState(0) // Key to reset SearchPanel state
    const [leftPanelMode, setLeftPanelMode] = useState<'search' | 'settings'>('search') // Left panel tab mode
    const [viewMode, setViewMode] = useState<ViewMode>('3d') // Default 3D view
    const [focusNodeId, setFocusNodeId] = useState<string | null>(null) // Node ID to focus on
    const [focusEdgeId, setFocusEdgeId] = useState<string | null>(null) // Edge ID to focus on
    const [focusClusterPosition, setFocusClusterPosition] = useState<[number, number, number] | null>(null) // Cluster centroid to focus on
    // Selection (via selectionStore, undoable)
    const highlightedNamespace = useSelectionStore(state => state.highlightedNamespace)
    const storeSelectedNodeId = useSelectionStore(state => state.selectedNodeId)
    const storeSelectedEdgeId = useSelectionStore(state => state.selectedEdgeId)
    const [showLabels, setShowLabels] = useState(true) // Whether to show node labels
    const getPositionsRef = useRef<(() => Map<string, [number, number, number]>) | null>(null) // Ref to get positions from ForceGraph3D

    // Physics settings for 3D force graph
    const [physics, setPhysics] = useState<PhysicsParams>({ ...DEFAULT_PHYSICS })
    const [expandedInfoTips, setExpandedInfoTips] = useState<Set<string>>(new Set())

    // Lens picker (Cmd+K)
    const { isOpen: isLensPickerOpen, open: openLensPicker, close: closeLensPicker } = useLensPickerShortcut()

    // Undo/Redo (Cmd+Z / Cmd+Shift+Z)
    const { canUndo, canRedo, undoLabel, redoLabel } = useUndoShortcut()

    // Viewport state (camera position persistence)
    const [initialViewport, setInitialViewport] = useState<ViewportData | null>(null)
    const [viewportLoaded, setViewportLoaded] = useState(false)

    // When project path changes, reset viewport loading state
    const prevProjectPathRef = useRef<string | null>(null)
    const selectionRestoredRef = useRef(false)
    const filterOptionsInitializedRef = useRef(false)  // Track if filter options have been initialized
    useEffect(() => {
        if (projectPath !== prevProjectPathRef.current) {
            prevProjectPathRef.current = projectPath
            setViewportLoaded(false)
            setInitialViewport(null)
            selectionRestoredRef.current = false  // Reset selection restored flag
            filterOptionsInitializedRef.current = false  // Reset filter options initialized flag
            // Also clear current selection state, wait to load from new project
            setSelectedNodeState(null)
            setSelectedEdge(null)
        }
    }, [projectPath])

    // Lean code viewer state
    const [codeViewerOpen, setCodeViewerOpen] = useState(false)
    const [codeFile, setCodeFile] = useState<FileContent | null>(null)
    const [codeLoading, setCodeLoading] = useState(false)
    const [codeDirty, setCodeDirty] = useState(false)  // Whether there are unsaved changes
    // Independent code location for edge selection (overrides selectedNode location when set)
    const [codeLocation, setCodeLocation] = useState<{ filePath: string; lineNumber: number } | null>(null)

    // Namespace index cache for fast "Jump to Code" from namespace bubbles
    const [namespaceIndex, setNamespaceIndex] = useState<Map<string, NamespaceLocation>>(new Map())
    const [lspBuilding, setLspBuilding] = useState(false)  // LSP index building in progress
    const [lspStatus, setLspStatus] = useState<string | null>(null)  // LSP status message for bottom bar

    // Canvas store - manages on-demand added nodes
    // Note: Most mutation operations use graphActions for undo support
    const {
        visibleNodes,
        customNodes,
        customEdges,
        positionsLoaded,
        searchResults,
        setProjectPath: setCanvasProjectPath,
        loadCanvas,
        resetAllData,
    } = useCanvasStore()

    // Custom node creation dialog state
    const [showCustomNodeDialog, setShowCustomNodeDialog] = useState(false)
    const [customNodeName, setCustomNodeName] = useState('')

    // Edit custom node name
    const [isEditingCustomNodeName, setIsEditingCustomNodeName] = useState(false)
    const [editingCustomNodeNameValue, setEditingCustomNodeNameValue] = useState('')
    const customNodeNameInputRef = useRef<HTMLInputElement>(null)

    // Add custom edge mode
    const [isAddingEdge, setIsAddingEdge] = useState(false)
    const [addingEdgeDirection, setAddingEdgeDirection] = useState<'outgoing' | 'incoming'>('outgoing')

    // Remove node mode - click nodes on canvas to delete directly
    const [isRemovingNodes, setIsRemovingNodes] = useState(false)

    // Edges panel collapse state
    const [customDepsExpanded, setCustomDepsExpanded] = useState(true)
    const [customUsedByExpanded, setCustomUsedByExpanded] = useState(true)
    const [provenDepsExpanded, setProvenDepsExpanded] = useState(true)
    const [provenUsedByExpanded, setProvenUsedByExpanded] = useState(true)

    // Confirmation dialog state
    const [showResetConfirm, setShowResetConfirm] = useState(false)
    const [showReloadPrompt, setShowReloadPrompt] = useState(false)
    const [showClearCanvasDialog, setShowClearCanvasDialog] = useState(false)
    const [selectedNodesToRemove, setSelectedNodesToRemove] = useState<Set<string>>(new Set())

    // Settings panel collapsible sections
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
    const toggleSection = useCallback((section: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev)
            if (next.has(section)) {
                next.delete(section)
            } else {
                next.add(section)
            }
            return next
        })
    }, [])

    // Analysis panel state
    const [sizeMappingMode, setSizeMappingMode] = useState<'default' | 'pagerank' | 'indegree' | 'depth' | 'bottleneck' | 'reachability'>('default')
    const [sizeContrast, setSizeContrast] = useState(0.5)  // 0 = uniform, 1 = max contrast
    const [colorMappingMode, setColorMappingMode] = useState<'kind' | 'namespace' | 'community' | 'layer' | 'spectral'>('kind')
    const [layoutClusterMode, setLayoutClusterMode] = useState<'none' | 'namespace' | 'community' | 'layer' | 'spectral'>('none')
    const [analysisData, setAnalysisData] = useState<{
        pagerank?: Record<string, number>
        indegree?: Record<string, number>
        communities?: Record<string, number>
        communityCount?: number
        modularity?: number
        nodeCount?: number
        edgeCount?: number
        density?: number
        // DAG analysis
        depths?: Record<string, number>
        layers?: Record<string, number>
        bottleneckScores?: Record<string, number>
        reachability?: Record<string, number>
        graphDepth?: number
        numLayers?: number
        sources?: string[]
        sinks?: string[]
        criticalPath?: string[]
        // Spectral clustering
        spectralClusters?: Record<string, number>
        numSpectralClusters?: number
        // Entropy
        vonNeumannEntropy?: number
        degreeShannon?: number
        structureEntropy?: number
    }>({})
    const [analysisLoading, setAnalysisLoading] = useState(false)

    // Community color palette (10 distinct colors)
    const COMMUNITY_COLORS = useMemo(() => [
        '#ef4444', // red
        '#f97316', // orange
        '#eab308', // yellow
        '#22c55e', // green
        '#14b8a6', // teal
        '#3b82f6', // blue
        '#8b5cf6', // violet
        '#ec4899', // pink
        '#6366f1', // indigo
        '#06b6d4', // cyan
    ], [])

    // Graph data - source nodes from backend API
    // Use nodes and edges (including backend-calculated default styles), while keeping legacyNodes for search and other compatibility features
    const {
        nodes: astrolabeNodes,
        edges: astrolabeEdges,
        legacyNodes: graphNodes,
        links: graphLinks,
        loading: graphLoading,
        reload: reloadGraph,
        reloadMeta,
        projectStatus,
        needsInit,
        notSupported,
        recheckStatus,
        rawNodeCount,
        rawEdgeCount,
        filterOptions,
        setFilterOptions,
        filterStats,
    } = useGraphData(projectPath)

    // Color helper - extract color mapping from backend-returned node data
    const typeColors = useMemo(() => {
        const colors: Record<string, string> = {}
        for (const node of astrolabeNodes) {
            if (!colors[node.kind]) {
                colors[node.kind] = node.defaultColor
            }
        }
        return colors
    }, [astrolabeNodes])

    // Compute namespace assignments from node IDs (depth 1 = top-level namespace)
    const namespaceData = useMemo(() => {
        if (!astrolabeNodes || astrolabeNodes.length === 0) return null
        const namespaceMap: Record<string, number> = {}
        const namespaceToId = new Map<string, number>()
        let nextId = 0
        for (const node of astrolabeNodes) {
            const parts = node.id.split('.')
            const namespace = parts.length > 1 ? parts[0] : '_root'
            if (!namespaceToId.has(namespace)) {
                namespaceToId.set(namespace, nextId++)
            }
            namespaceMap[node.id] = namespaceToId.get(namespace)!
        }
        return { map: namespaceMap, count: namespaceToId.size, names: Array.from(namespaceToId.keys()) }
    }, [astrolabeNodes])

    // Convert communities/clusters to Map for ForceLayout
    // Uses layoutClusterMode (independent from colorMappingMode)
    const nodeCommunities = useMemo(() => {
        if (layoutClusterMode === 'namespace') {
            return namespaceData?.map
                ? new Map(Object.entries(namespaceData.map))
                : null
        }
        if (layoutClusterMode === 'spectral') {
            return analysisData.spectralClusters
                ? new Map(Object.entries(analysisData.spectralClusters))
                : null
        }
        if (layoutClusterMode === 'layer') {
            return analysisData.layers
                ? new Map(Object.entries(analysisData.layers).map(([k, v]) => [k, v]))
                : null
        }
        if (layoutClusterMode === 'community') {
            return analysisData.communities
                ? new Map(Object.entries(analysisData.communities))
                : null
        }
        // For 'none' mode, no clustering
        return null
    }, [layoutClusterMode, namespaceData, analysisData.communities, analysisData.spectralClusters, analysisData.layers])

    // Namespace depth preview for clustering UI
    const namespaceDepthPreview = useMemo(() => {
        return getNamespaceDepthPreview(astrolabeNodes, 5)
    }, [astrolabeNodes])

    // Auto-select lens for large graphs on first load
    const autoSelectLens = useLensStore(state => state.autoSelectLens)
    const activeLensId = useLensStore(state => state.activeLensId)
    const hasAutoSelectedRef = useRef(false)
    useEffect(() => {
        // Only auto-select once per project load, and only for large graphs
        if (!hasAutoSelectedRef.current && rawNodeCount > 300) {
            hasAutoSelectedRef.current = true
            autoSelectLens(rawNodeCount)
        }
    }, [rawNodeCount, autoSelectLens])

    // Reset auto-select flag when project changes
    useEffect(() => {
        hasAutoSelectedRef.current = false
    }, [projectPath])

    // Load existing namespace index when project is ready (does NOT auto-build)
    useEffect(() => {
        if (!projectPath || graphLoading || needsInit) return

        const loadNamespaceIndex = async () => {
            try {
                const result = await getNamespaceIndex(projectPath)
                if (result.namespaces.length > 0) {
                    const indexMap = new Map<string, NamespaceLocation>()
                    for (const ns of result.namespaces) {
                        indexMap.set(ns.name, ns)
                    }
                    setNamespaceIndex(indexMap)
                    console.log(`[LSP] Loaded ${result.namespaces.length} namespaces from lsp.json`)
                } else {
                    console.log('[LSP] No lsp.json cache found. Click LSP button to build.')
                }
            } catch (error) {
                console.warn('[LSP] Failed to load index:', error)
            }
        }

        loadNamespaceIndex()
    }, [projectPath, graphLoading, needsInit])

    // Manual LSP build function
    const handleBuildLsp = useCallback(async () => {
        if (!projectPath || lspBuilding) return

        setLspBuilding(true)
        setLspStatus('Connecting to Lean LSP...')
        console.log('[LSP] Building index...')

        try {
            setLspStatus('Building LSP cache (scanning files)...')
            const result = await buildNamespaceIndex(projectPath)
            console.log(`[LSP] Built index with ${result.count} namespaces, ${result.file_count} files`)
            setLspStatus(`LSP cache built: ${result.count} namespaces`)

            // Reload the index into memory
            const loaded = await getNamespaceIndex(projectPath)
            const indexMap = new Map<string, NamespaceLocation>()
            for (const ns of loaded.namespaces) {
                indexMap.set(ns.name, ns)
            }
            setNamespaceIndex(indexMap)

            // Clear status after a short delay
            setTimeout(() => setLspStatus(null), 3000)
        } catch (error) {
            console.error('[LSP] Failed to build index:', error)
            setLspStatus('LSP build failed')
            setTimeout(() => setLspStatus(null), 5000)
        } finally {
            setLspBuilding(false)
        }
    }, [projectPath, lspBuilding])

    // Status colors - from unified proof status config (memoized for performance)
    const statusColors: Record<string, string> = useMemo(() =>
        Object.fromEntries(
            Object.entries(PROOF_STATUS_CONFIG).map(([key, config]) => [key, config.color])
        ),
        []  // PROOF_STATUS_CONFIG is static, only compute once
    )

    // Selected node for info panel - sync with astrolabe config
    const [selectedNode, setSelectedNodeState] = useState<GraphNode | null>(null)
    // Click counter, used to trigger Monaco highlight refresh (even when clicking the same node)
    const [nodeClickCount, setNodeClickCount] = useState(0)

    // Selected edge for edge style editing
    interface SelectedEdge {
        id: string
        source: string
        target: string
        sourceName: string
        targetName: string
        notes?: string
        style?: string
        effect?: string
        defaultStyle: string  // Default style for this edge
        skippedNodes?: string[]  // Technical nodes this shortcut edge bypasses
    }
    const [selectedEdge, setSelectedEdge] = useState<SelectedEdge | null>(null)

    const setSelectedNode = useCallback((node: GraphNode | null) => {
        setSelectedNodeState(node)
        setNodeClickCount(c => c + 1)  // Increment on each click, trigger highlight refresh

        // Track in undo history
        selectNodeUndoable(node?.id ?? null)

        // As long as node is selected and on canvas, focus on it
        // Check regular node or custom node
        const isOnCanvas = node && (
            visibleNodes.includes(node.id) ||
            customNodes.some(cn => cn.id === node.id)
        )
        if (isOnCanvas) {
            setFocusNodeId(node.id)
        }
        // If newly selected node is not either end of current edge, clear edge highlight
        if (node && selectedEdge) {
            if (node.id !== selectedEdge.source && node.id !== selectedEdge.target) {
                setSelectedEdge(null)
            }
        }
        // Save selected node to viewport
        if (projectPath) {
            updateViewport(projectPath, {
                selected_node_id: node?.id,
            }).catch((err) => {
                console.error('[page] Failed to save selected node:', err)
            })
        }
    }, [visibleNodes, customNodes, projectPath, selectedEdge])

    // When graphNodes updates, synchronize update of selectedNode (keep meta data up to date)
    useEffect(() => {
        if (selectedNode && graphNodes.length > 0) {
            const updatedNode = graphNodes.find(n => n.id === selectedNode.id)
            if (updatedNode && (
                updatedNode.customSize !== selectedNode.customSize ||
                updatedNode.customEffect !== selectedNode.customEffect ||
                updatedNode.customColor !== selectedNode.customColor
            )) {
                setSelectedNodeState(updatedNode)
            }
        }
    }, [graphNodes, selectedNode])

    // Sync local selectedNode with store (for undo/redo)
    // When storeSelectedNodeId changes externally, find the node and update local state
    useEffect(() => {
        const currentId = selectedNode?.id ?? null
        if (storeSelectedNodeId !== currentId) {
            // Store changed (from undo/redo), sync local state
            if (storeSelectedNodeId === null) {
                setSelectedNodeState(null)
            } else {
                // Find the node in graphNodes or customNodes
                const node = graphNodes.find(n => n.id === storeSelectedNodeId)
                    || customNodes.find(n => n.id === storeSelectedNodeId) as GraphNode | undefined
                if (node) {
                    setSelectedNodeState(node)
                    setNodeClickCount(c => c + 1)
                }
            }
        }
    }, [storeSelectedNodeId, graphNodes, customNodes, selectedNode?.id])

    // Handle adding custom edge
    const handleAddCustomEdge = useCallback(async (targetNodeId: string) => {
        if (!selectedNode || !isAddingEdge) return

        const source = addingEdgeDirection === 'outgoing' ? selectedNode.id : targetNodeId
        const target = addingEdgeDirection === 'outgoing' ? targetNodeId : selectedNode.id

        // Cannot add edge from self to self
        if (source === target) {
            console.log('[page] Cannot add edge to self')
            setIsAddingEdge(false)
            return
        }

        try {
            // Pass all Lean edges to check for cycles
            const leanEdges = astrolabeEdges.map(e => ({ source: e.source, target: e.target }))
            const result = await graphActions.createCustomEdge(source, target, leanEdges)

            if (result.error) {
                // Show error alert for cycle detection
                alert(result.error)
                console.warn('[page] Edge creation blocked:', result.error)
            } else if (result.edge) {
                console.log('[page] Created custom edge:', result.edge)
            }
        } catch (err) {
            console.error('[page] Failed to create custom edge:', err)
        }

        setIsAddingEdge(false)
    }, [selectedNode, isAddingEdge, addingEdgeDirection, astrolabeEdges])

    // Cancel adding edge mode
    const cancelAddingEdge = useCallback(() => {
        setIsAddingEdge(false)
    }, [])

    // Save custom node name
    const saveCustomNodeName = useCallback(async () => {
        if (!selectedNode || selectedNode.type !== 'custom' || !editingCustomNodeNameValue.trim()) {
            setIsEditingCustomNodeName(false)
            return
        }
        const newName = editingCustomNodeNameValue.trim()
        if (newName !== selectedNode.name) {
            await graphActions.updateCustomNode(selectedNode.id, newName, selectedNode.name)
            // Update selectedNode display
            setSelectedNodeState(prev => prev ? { ...prev, name: newName } : null)
        }
        setIsEditingCustomNodeName(false)
    }, [selectedNode, editingCustomNodeNameValue])

    // Undoable filter options update
    const updateFilterOptionsUndoable = useCallback(async (newOptions: typeof filterOptions) => {
        if (!projectPath) return
        await viewportActions.updateFilterOptions(
            projectPath,
            newOptions,
            filterOptions,
            setFilterOptions
        )
    }, [projectPath, filterOptions, setFilterOptions])

    // Undoable physics settings update
    const updatePhysicsUndoable = useCallback(async (newPhysics: typeof physics) => {
        if (!projectPath) return
        await viewportActions.updatePhysics(
            projectPath,
            newPhysics,
            physics,
            setPhysics
        )
    }, [projectPath, physics])

    // When selected node is added to canvas, automatically focus on it
    const prevVisibleNodesRef = useRef<string[]>([])
    useEffect(() => {
        if (selectedNode && visibleNodes.includes(selectedNode.id)) {
            // Check if it's a newly added node
            if (!prevVisibleNodesRef.current.includes(selectedNode.id)) {
                setFocusNodeId(selectedNode.id)
            }
        }
        prevVisibleNodesRef.current = visibleNodes
    }, [visibleNodes, selectedNode])

    // Notes - now from backend meta.json via graphNode.notes
    const [editingNote, setEditingNote] = useState<string>('')
    // Code view mode: 'code' for Lean code, 'notes' for Markdown notes
    const [codeViewMode, setCodeViewMode] = useState<'code' | 'notes'>('code')

    // Tool panel view state
    const [toolPanelView, setToolPanelView] = useState<'edges' | 'notes' | 'style' | 'neighbors' | null>(null)
    const [notesExpanded, setNotesExpanded] = useState(false)


    // Auto-save note when it changes (with debounce)
    // Uniformly store to backend meta.json, no longer use frontend local config
    const saveNoteTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const originalNoteRef = useRef<string>('') // Track original value for undo
    const handleNoteChange = useCallback((value: string) => {
        // Capture original value on first change (for undo)
        if (!saveNoteTimeoutRef.current && selectedNode) {
            originalNoteRef.current = selectedNode.notes || ''
        }

        setEditingNote(value)
        // Debounce auto-save
        if (saveNoteTimeoutRef.current) {
            clearTimeout(saveNoteTimeoutRef.current)
        }
        if (selectedNode && projectPath) {
            const nodeId = selectedNode.id
            const oldNotes = originalNoteRef.current

            saveNoteTimeoutRef.current = setTimeout(async () => {
                // Use undoable action for save
                try {
                    await graphActions.updateNodeMeta(
                        projectPath,
                        nodeId,
                        { notes: value || undefined },
                        { notes: oldNotes || undefined },
                        'Edit notes'
                    )
                    // Reset original ref after successful save
                    originalNoteRef.current = value
                } catch (err) {
                    console.error('[handleNoteChange] Failed to sync note to backend:', err)
                }
            }, 500) // Save after 500ms of no typing
        }
    }, [selectedNode, projectPath])


    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (saveNoteTimeoutRef.current) {
                clearTimeout(saveNoteTimeoutRef.current)
            }
        }
    }, [])

    // Unified node selection entry point
    const selectNode = useCallback((node: GraphNode | null) => {
        setSelectedNode(node)
        // Clear codeLocation when selecting a node (use node's location instead)
        setCodeLocation(null)
        if (node) {
            setEditingNote(node.notes || '')
            // If node has Lean file, automatically open code viewer
            if (node.leanFilePath) {
                setCodeViewerOpen(true)
                setCodeViewMode('code')
            }
        } else {
            setEditingNote('')
            setCodeViewerOpen(false)
        }
    }, [setSelectedNode])

    // Handle style change from NodeStylePanel
    // Uniformly store to backend meta.json, no longer use frontend local config
    const handleStyleChange = useCallback(async (nodeId: string, style: { effect?: string; size?: number }) => {
        console.log('[handleStyleChange]', { nodeId, style })
        if (!projectPath) return

        // Get old values for undo
        const node = graphNodes.find(n => n.id === nodeId)
        const oldStyle = {
            effect: node?.customEffect,
            size: node?.customSize,
        }

        try {
            // Use undoable action for style changes
            await graphActions.updateNodeMeta(
                projectPath,
                nodeId,
                { size: style.size, effect: style.effect },
                { size: oldStyle.size, effect: oldStyle.effect },
                'Change node style'
            )
            // Refresh data to display new style
            console.log('[handleStyleChange] Refreshing meta after update...')
            reloadMeta()
            loadCanvas()
        } catch (err) {
            console.error('[handleStyleChange] Failed to update node meta:', err)
        }
    }, [projectPath, reloadMeta, loadCanvas, graphNodes])

    // Handle edge style change from EdgeStylePanel
    const handleEdgeStyleChange = useCallback(async (edgeId: string, style: { effect?: string; style?: string }) => {
        console.log('[handleEdgeStyleChange]', { edgeId, style })
        if (!projectPath) return

        // Get old values for undo
        const edge = astrolabeEdges.find(e => e.id === edgeId) || customEdges.find(e => e.id === edgeId)
        const oldStyle = {
            effect: edge?.effect,
            style: edge?.style,
        }

        try {
            // Use undoable action for edge style changes
            await graphActions.updateEdgeMeta(
                projectPath,
                edgeId,
                { effect: style.effect, style: style.style },
                { effect: oldStyle.effect, style: oldStyle.style },
                'Change edge style'
            )
            // Refresh data to display new styles
            reloadMeta()
            loadCanvas()
        } catch (err) {
            console.error('[handleEdgeStyleChange] Failed to update edge meta:', err)
        }
    }, [projectPath, reloadMeta, loadCanvas, astrolabeEdges, customEdges])

    // Toggle code viewer
    const handleToggleCodeViewer = useCallback(() => {
        setCodeViewerOpen(prev => !prev)
    }, [])

    // Automatically load code when codeViewerOpen is true
    // Priority: codeLocation (from edge selection) > selectedNode location
    useEffect(() => {
        const filePath = codeLocation?.filePath || selectedNode?.leanFilePath
        if (!codeViewerOpen || !filePath) {
            return
        }

        const loadCode = async () => {
            setCodeLoading(true)
            try {
                // Load full file to support editing
                const result = await readFullFile(filePath)
                setCodeFile(result)
            } catch (error) {
                console.error('Failed to read file:', error)
                setCodeFile({
                    content: '-- Failed to load file',
                    startLine: 1,
                    endLine: 1,
                    totalLines: 1,
                })
            } finally {
                setCodeLoading(false)
            }
        }

        loadCode()
    }, [codeViewerOpen, codeLocation?.filePath, codeLocation?.lineNumber, selectedNode?.leanFilePath, selectedNode?.leanLineNumber])

    // Handle code editing changes
    const handleCodeChange = useCallback(async (newContent: string) => {
        if (!projectPath || !selectedNode?.leanFilePath) return

        // Update local state
        setCodeFile(prev => prev ? { ...prev, content: newContent } : null)
        setCodeDirty(true)  // Mark as having unsaved changes
    }, [projectPath, selectedNode?.leanFilePath])

    // Save file to disk (placeholder - file saving not implemented yet)
    const handleSaveFile = useCallback(async () => {
        if (!projectPath || !selectedNode?.leanFilePath || !codeFile) {
            return
        }
        // TODO: Implement file saving via Tauri API
        console.warn('[Save] File saving not implemented yet')
        setCodeDirty(false)  // Clear dirty state for now
    }, [projectPath, selectedNode?.leanFilePath, codeFile])

    // Ctrl+S keyboard shortcut for saving (backup, mainly handled by Monaco Editor)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault()
                handleSaveFile()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [handleSaveFile])

    // Reset dirty state when switching files
    useEffect(() => {
        setCodeDirty(false)
    }, [selectedNode?.leanFilePath])

    const handleToggleToolView = (tool: 'edges' | 'notes' | 'style' | 'neighbors') => {
        if (toolPanelView === tool) {
            setToolPanelView(null) // Toggle off (collapse)
        } else {
            setToolPanelView(tool) // Expand this section
        }
    }

    // Check if right panel should be visible (info panel or code viewer)
    const rightPanelVisible = infoPanelOpen || codeViewerOpen

    useEffect(() => {
        setIsTauri(!!(window as any).__TAURI_INTERNALS__)
    }, [])

    // Initialize canvasStore
    useEffect(() => {
        if (projectPath) {
            setCanvasProjectPath(projectPath)
            loadCanvas()
        }
    }, [projectPath, setCanvasProjectPath, loadCanvas])

    // Load viewport state (camera position, filter options, and physics settings)
    useEffect(() => {
        if (!projectPath || viewportLoaded) return

        getViewport(projectPath)
            .then((viewport) => {
                setInitialViewport(viewport)
                // Restore filter options from viewport
                if (viewport.filter_options) {
                    setFilterOptions({
                        hideTechnical: viewport.filter_options.hideTechnical ?? false,
                        hideOrphaned: viewport.filter_options.hideOrphaned ?? false,
                        transitiveReduction: viewport.filter_options.transitiveReduction ?? true,
                    })
                }
                // Restore physics settings from viewport
                if (viewport.physics_settings) {
                    const ps = viewport.physics_settings
                    setPhysics(prev => ({
                        ...prev,
                        ...(ps.repulsionStrength !== undefined && { repulsionStrength: ps.repulsionStrength }),
                        ...(ps.springLength !== undefined && { springLength: ps.springLength }),
                        ...(ps.springStrength !== undefined && { springStrength: ps.springStrength }),
                        ...(ps.centerStrength !== undefined && { centerStrength: ps.centerStrength }),
                        ...(ps.damping !== undefined && { damping: ps.damping }),
                        ...(ps.clusteringEnabled !== undefined && { clusteringEnabled: ps.clusteringEnabled }),
                        ...(ps.clusteringStrength !== undefined && { clusteringStrength: ps.clusteringStrength }),
                        ...(ps.clusterSeparation !== undefined && { clusterSeparation: ps.clusterSeparation }),
                        ...(ps.clusteringDepth !== undefined && { clusteringDepth: ps.clusteringDepth }),
                        ...(ps.adaptiveSpringEnabled !== undefined && { adaptiveSpringEnabled: ps.adaptiveSpringEnabled }),
                        ...(ps.adaptiveSpringMode !== undefined && { adaptiveSpringMode: ps.adaptiveSpringMode as 'sqrt' | 'logarithmic' | 'linear' }),
                        ...(ps.adaptiveSpringScale !== undefined && { adaptiveSpringScale: ps.adaptiveSpringScale }),
                    }))
                }
                setViewportLoaded(true)
            })
            .catch((err) => {
                console.error('[page] Failed to load viewport:', err)
                setViewportLoaded(true)
            })
    }, [projectPath, viewportLoaded, setFilterOptions])

    // Restore selection state (executed after node data is loaded)
    useEffect(() => {
        // Requires viewport loaded, node data loaded, and selection not yet restored
        if (!initialViewport || graphNodes.length === 0 || selectionRestoredRef.current) return

        // Mark as restored to avoid duplicate execution
        selectionRestoredRef.current = true

        // Restore selected node
        if (initialViewport.selected_node_id) {
            const savedNode = graphNodes.find(n => n.id === initialViewport.selected_node_id)
            if (savedNode) {
                setSelectedNodeState(savedNode)
                setEditingNote(savedNode.notes || '')
                // Trigger focus on selected node
                setFocusNodeId(savedNode.id)
                console.log('[page] Restored selected node:', savedNode.id)
            }
        }

        // Restore selected edge
        if (initialViewport.selected_edge_id) {
            const parts = initialViewport.selected_edge_id.split('->')
            if (parts.length === 2) {
                const [sourceId, targetId] = parts
                const sourceNode = graphNodes.find(n => n.id === sourceId) || customNodes.find(n => n.id === sourceId)
                const targetNode = graphNodes.find(n => n.id === targetId) || customNodes.find(n => n.id === targetId)
                // Find edge style information
                const edgeData = astrolabeEdges.find(e => e.id === initialViewport.selected_edge_id)
                const customEdge = customEdges.find(e => e.id === initialViewport.selected_edge_id)
                if (sourceNode && targetNode) {
                    setSelectedEdge({
                        id: initialViewport.selected_edge_id,
                        source: sourceId,
                        target: targetId,
                        sourceName: sourceNode.name,
                        targetName: targetNode.name,
                        notes: edgeData?.notes || customEdge?.notes,
                        style: edgeData?.style || customEdge?.style,
                        effect: edgeData?.effect || customEdge?.effect,
                        defaultStyle: edgeData?.defaultStyle || 'solid',
                    })
                    // Trigger focus on edge
                    setFocusEdgeId(initialViewport.selected_edge_id)
                    console.log('[page] Restored selected edge:', initialViewport.selected_edge_id)
                }
            }
        }
    }, [initialViewport, graphNodes, customNodes, astrolabeEdges, customEdges])

    // Save filter options when they change (with debounce)
    // Skip saving on initial load to avoid overwriting saved values with defaults
    const saveFilterTimeoutRef = useRef<NodeJS.Timeout | null>(null)

    useEffect(() => {
        if (!projectPath || !viewportLoaded) return

        // Skip the first trigger after viewport is loaded (initial state)
        if (!filterOptionsInitializedRef.current) {
            filterOptionsInitializedRef.current = true
            return
        }

        // Debounce: save after 300ms
        if (saveFilterTimeoutRef.current) {
            clearTimeout(saveFilterTimeoutRef.current)
        }
        saveFilterTimeoutRef.current = setTimeout(() => {
            updateViewport(projectPath, {
                filter_options: {
                    hideTechnical: filterOptions.hideTechnical,
                    hideOrphaned: filterOptions.hideOrphaned,
                    transitiveReduction: filterOptions.transitiveReduction ?? true,
                },
            }).catch((err) => {
                console.error('[page] Failed to save filter options:', err)
            })
        }, 300)

        return () => {
            if (saveFilterTimeoutRef.current) {
                clearTimeout(saveFilterTimeoutRef.current)
            }
        }
    }, [projectPath, viewportLoaded, filterOptions])

    // Save camera position (with debounce)
    const saveCameraTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const lastCameraRef = useRef<{ position: [number, number, number]; target: [number, number, number]; saved: boolean } | null>(null)
    const handleCameraChange = useCallback((
        position: [number, number, number],
        target: [number, number, number]
    ) => {
        if (!projectPath) return

        // Record latest camera position
        lastCameraRef.current = { position, target, saved: false }

        // Debounce: save after 500ms
        if (saveCameraTimeoutRef.current) {
            clearTimeout(saveCameraTimeoutRef.current)
        }
        saveCameraTimeoutRef.current = setTimeout(() => {
            updateViewport(projectPath, {
                camera_position: position,
                camera_target: target,
            }).then(() => {
                if (lastCameraRef.current) {
                    lastCameraRef.current.saved = true
                }
            }).catch((err) => {
                console.error('[page] Failed to save camera position:', err)
            })
        }, 500)
    }, [projectPath])

    // Save unsaved camera position before page unload
    const projectPathRef = useRef(projectPath)
    projectPathRef.current = projectPath

    useEffect(() => {
        const saveBeforeUnload = () => {
            if (projectPathRef.current && lastCameraRef.current && !lastCameraRef.current.saved) {
                // Use sendBeacon for synchronous save (does not block page close)
                const data = JSON.stringify({
                    path: projectPathRef.current,
                    camera_position: lastCameraRef.current.position,
                    camera_target: lastCameraRef.current.target,
                })
                navigator.sendBeacon('http://127.0.0.1:8765/api/canvas/viewport', data)
            }
        }

        window.addEventListener('beforeunload', saveBeforeUnload)
        return () => {
            window.removeEventListener('beforeunload', saveBeforeUnload)
            // Also save on component unmount
            if (projectPathRef.current && lastCameraRef.current && !lastCameraRef.current.saved) {
                updateViewport(projectPathRef.current, {
                    camera_position: lastCameraRef.current.position,
                    camera_target: lastCameraRef.current.target,
                }).catch(() => {})
            }
            if (saveCameraTimeoutRef.current) {
                clearTimeout(saveCameraTimeoutRef.current)
            }
        }
    }, [])

    // Calculate nodes and edges to display on canvas
    // Convert GraphNode to Node type
    const mapStatusToNodeStatus = (status: string): 'proven' | 'sorry' | 'error' | 'unknown' => {
        if (status === 'proven') return 'proven'
        if (status === 'sorry') return 'sorry'
        if (status === 'error') return 'error'
        return 'unknown' // 'stated' and other statuses map to 'unknown'
    }

    const canvasNodes: Node[] = useMemo(() => {
        // Canvas mode: only show visibleNodes (interactive exploration)
        // Other lenses: show all nodes (lens system handles visibility via filtering/aggregation)
        const isCanvasMode = !activeLensId || activeLensId === 'canvas'

        // Calculate size based on analysis mode
        // Exponent controls contrast: lower = more contrast, higher = more uniform
        // sizeContrast 0 → exponent 1.0 (uniform), sizeContrast 1 → exponent 0.2 (max contrast)
        const sizeExponent = 1.0 - sizeContrast * 0.8
        const getNodeSize = (nodeId: string, metaSize?: number): number | undefined => {
            // Helper to normalize and scale
            const normalizeAndScale = (value: number, min: number, max: number): number => {
                const normalized = max > min ? (value - min) / (max - min) : 0.5
                return 0.3 + Math.pow(normalized, sizeExponent) * 4.7
            }

            if (sizeMappingMode === 'pagerank' && analysisData.pagerank) {
                const pr = analysisData.pagerank[nodeId]
                if (pr !== undefined) {
                    const values = Object.values(analysisData.pagerank)
                    return normalizeAndScale(pr, Math.min(...values), Math.max(...values))
                }
            }
            if (sizeMappingMode === 'indegree' && analysisData.indegree) {
                const deg = analysisData.indegree[nodeId]
                if (deg !== undefined) {
                    const maxDeg = Math.max(...Object.values(analysisData.indegree))
                    return normalizeAndScale(deg, 0, maxDeg)
                }
            }
            if (sizeMappingMode === 'depth' && analysisData.depths) {
                const depth = analysisData.depths[nodeId]
                if (depth !== undefined) {
                    const maxDepth = analysisData.graphDepth || Math.max(...Object.values(analysisData.depths))
                    return normalizeAndScale(depth, 0, maxDepth)
                }
            }
            if (sizeMappingMode === 'bottleneck' && analysisData.bottleneckScores) {
                const score = analysisData.bottleneckScores[nodeId]
                if (score !== undefined) {
                    const values = Object.values(analysisData.bottleneckScores)
                    return normalizeAndScale(score, Math.min(...values), Math.max(...values))
                }
            }
            if (sizeMappingMode === 'reachability' && analysisData.reachability) {
                const reach = analysisData.reachability[nodeId]
                if (reach !== undefined) {
                    const maxReach = Math.max(...Object.values(analysisData.reachability))
                    return normalizeAndScale(reach, 0, maxReach)
                }
            }
            return metaSize // Use original meta size (undefined means use default)
        }

        // Layer color palette (gradient from light to dark blue)
        const LAYER_COLORS = [
            '#93c5fd', // blue-300
            '#60a5fa', // blue-400
            '#3b82f6', // blue-500
            '#2563eb', // blue-600
            '#1d4ed8', // blue-700
            '#1e40af', // blue-800
            '#1e3a8a', // blue-900
            '#172554', // blue-950
        ]

        // Calculate color based on color mapping mode
        const getNodeColor = (nodeId: string, defaultColor: string): string => {
            if (colorMappingMode === 'namespace' && namespaceData?.map) {
                const nsId = namespaceData.map[nodeId]
                if (nsId !== undefined) {
                    return COMMUNITY_COLORS[nsId % COMMUNITY_COLORS.length]
                }
            }
            if (colorMappingMode === 'community' && analysisData.communities) {
                const communityId = analysisData.communities[nodeId]
                if (communityId !== undefined) {
                    return COMMUNITY_COLORS[communityId % COMMUNITY_COLORS.length]
                }
            }
            if (colorMappingMode === 'layer' && analysisData.layers) {
                const layer = analysisData.layers[nodeId]
                if (layer !== undefined) {
                    const numLayers = analysisData.numLayers || Math.max(...Object.values(analysisData.layers)) + 1
                    const colorIndex = Math.floor((layer / numLayers) * (LAYER_COLORS.length - 1))
                    return LAYER_COLORS[Math.min(colorIndex, LAYER_COLORS.length - 1)]
                }
            }
            if (colorMappingMode === 'spectral' && analysisData.spectralClusters) {
                const clusterId = analysisData.spectralClusters[nodeId]
                if (clusterId !== undefined) {
                    return COMMUNITY_COLORS[clusterId % COMMUNITY_COLORS.length]
                }
            }
            return defaultColor
        }

        return astrolabeNodes
            .filter(node => !isCanvasMode || visibleNodes.includes(node.id))
            .map(node => ({
                id: node.id,
                name: node.name,
                kind: node.kind,
                filePath: node.leanFile?.path || '',
                lineNumber: node.leanFile?.line || 0,
                status: mapStatusToNodeStatus(node.status),
                references: [],
                // Statistics fields
                dependsOnCount: 0,
                usedByCount: 0,
                depth: 0,
                // Default styles - apply community color if enabled
                defaultColor: getNodeColor(node.id, node.defaultColor),
                defaultSize: node.defaultSize,
                defaultShape: node.defaultShape,
                // User override styles - from meta.json
                meta: {
                    size: getNodeSize(node.id, node.size),
                    shape: node.shape,
                    effect: node.effect,
                    // Position information - used for direct positioning during initialization, avoiding physics simulation "pulling"
                    position: node.position ? [node.position.x, node.position.y, node.position.z] as [number, number, number] : undefined,
                },
            }))
    }, [astrolabeNodes, visibleNodes, activeLensId, sizeMappingMode, sizeContrast, analysisData.pagerank, analysisData.indegree, analysisData.depths, analysisData.bottleneckScores, analysisData.reachability, analysisData.graphDepth, colorMappingMode, analysisData.communities, analysisData.layers, analysisData.numLayers, analysisData.spectralClusters, COMMUNITY_COLORS, namespaceData])

    const canvasEdges: Edge[] = useMemo(() => {
        const nodeIds = new Set(canvasNodes.map(n => n.id))
        // Use backend-returned edge data (including default styles)
        return astrolabeEdges
            .filter(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target))
            .map(edge => ({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                fromLean: edge.fromLean,
                visible: edge.visible,
                // Default styles - directly use backend-returned values
                defaultColor: edge.defaultColor,
                defaultWidth: edge.defaultWidth,
                defaultStyle: edge.defaultStyle,
                // User override styles - from meta.json (color and width removed)
                meta: {
                    style: edge.style,
                    effect: edge.effect,
                },
            }))
    }, [astrolabeEdges, canvasNodes])

    // Compute namespaces that have nodes on canvas (for highlighting in namespace list)
    const namespacesOnCanvas: Set<string> = useMemo(() => {
        if (canvasNodes.length === 0) return new Set()
        const groups = groupNodesByNamespace(canvasNodes as any, physics.clusteringDepth)
        return new Set(groups.keys())
    }, [canvasNodes, physics.clusteringDepth])

    // Handle namespace click - focus on cluster centroid and highlight nodes
    const handleNamespaceClick = useCallback((namespace: string) => {
        if (!getPositionsRef.current) return

        const positions = getPositionsRef.current()
        const namespaceGroups = groupNodesByNamespace(canvasNodes as any, physics.clusteringDepth)
        const nodesInNamespace = namespaceGroups.get(namespace)

        if (!nodesInNamespace || nodesInNamespace.length === 0) return

        // Collect node IDs for highlighting
        const nodeIds = new Set(nodesInNamespace.map((n: any) => n.id))

        // Compute centroid
        let sumX = 0, sumY = 0, sumZ = 0, count = 0
        for (const node of nodesInNamespace) {
            const pos = positions.get(node.id)
            if (pos) {
                sumX += pos[0]
                sumY += pos[1]
                sumZ += pos[2]
                count++
            }
        }

        if (count > 0) {
            setFocusClusterPosition([sumX / count, sumY / count, sumZ / count])
            highlightNamespaceUndoable(namespace, nodeIds)
        }
    }, [canvasNodes, physics.clusteringDepth])

    // Calculate which nodes have hidden neighbors (dependencies or dependents not on canvas)
    // These nodes should be highlighted to indicate they can be "expanded"
    const nodesWithHiddenNeighbors: Set<string> = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes)
        const result = new Set<string>()

        // For each visible node, check if any of its neighbors are hidden
        for (const nodeId of visibleNodeIds) {
            // Check all edges from astrolabeEdges (complete edge list)
            for (const edge of astrolabeEdges) {
                if (edge.source === nodeId && !visibleNodeIds.has(edge.target)) {
                    // This node has a hidden dependency (outgoing edge to hidden node)
                    result.add(nodeId)
                    break
                }
                if (edge.target === nodeId && !visibleNodeIds.has(edge.source)) {
                    // This node has a hidden dependent (incoming edge from hidden node)
                    result.add(nodeId)
                    break
                }
            }
        }

        return result
    }, [visibleNodes, astrolabeEdges])

    // Only show customNodes in visibleNodes (uniformly controlled by visibleNodes[] for visibility)
    const visibleCustomNodes = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes)
        return customNodes.filter(node => visibleNodeIds.has(node.id))
    }, [customNodes, visibleNodes])

    // Only show customEdges where both endpoint nodes are visible
    const visibleCustomEdges = useMemo(() => {
        const visibleNodeIds = new Set(visibleNodes)
        return customEdges.filter(edge => {
            // Both source and target need to be in visibleNodes
            const sourceVisible = visibleNodeIds.has(edge.source)
            const targetVisible = visibleNodeIds.has(edge.target)
            return sourceVisible && targetVisible
        })
    }, [customEdges, visibleNodes])

    // Calculate status lines for each node in the current file (for displaying status icons)
    // proven -> ✓, sorry -> ⚠
    const nodeStatusLines = useMemo(() => {
        return calculateNodeStatusLines(selectedNode?.leanFilePath, astrolabeNodes)
    }, [selectedNode?.leanFilePath, astrolabeNodes])

    // Compute analysis (PageRank, degree, communities, DAG metrics)
    const computeAnalysis = useCallback(async () => {
        if (!projectPath) return

        setAnalysisLoading(true)
        try {
            const baseUrl = 'http://127.0.0.1:8765/api/project/analysis'
            const pathParam = `path=${encodeURIComponent(projectPath)}`

            // Fetch all analysis data in parallel
            const [pagerankRes, degreeRes, communitiesRes, dagRes, spectralRes, entropyRes] = await Promise.all([
                fetch(`${baseUrl}/pagerank?${pathParam}&top_k=10000`),
                fetch(`${baseUrl}/degree?${pathParam}`),
                fetch(`${baseUrl}/communities?${pathParam}`),
                fetch(`${baseUrl}/dag?${pathParam}&include_all_depths=true&include_all_scores=true`),
                fetch(`${baseUrl}/spectral?${pathParam}&n_clusters=8`),
                fetch(`${baseUrl}/entropy?${pathParam}`),
            ])

            // Parse responses
            const pagerankData = pagerankRes.ok ? await pagerankRes.json() : null
            const degreeData = degreeRes.ok ? await degreeRes.json() : null
            const communitiesData = communitiesRes.ok ? await communitiesRes.json() : null
            const dagData = dagRes.ok ? await dagRes.json() : null
            const spectralData = spectralRes.ok ? await spectralRes.json() : null
            const entropyData = entropyRes.ok ? await entropyRes.json() : null


            // Build pagerank map
            const pagerankMap: Record<string, number> = {}
            if (pagerankData?.data?.topNodes) {
                for (const item of pagerankData.data.topNodes) {
                    pagerankMap[item.nodeId] = item.value
                }
            }

            // Build indegree map from top in-degree nodes
            const indegreeMap: Record<string, number> = {}
            if (degreeData?.data?.topInDegree) {
                for (const item of degreeData.data.topInDegree) {
                    indegreeMap[item.nodeId] = item.degree
                }
            }

            // Build communities map from topCommunities
            const communitiesMap: Record<string, number> = {}
            if (communitiesData?.data?.topCommunities) {
                for (const community of communitiesData.data.topCommunities) {
                    for (const nodeId of community.members) {
                        communitiesMap[nodeId] = community.id
                    }
                }
            }

            setAnalysisData({
                pagerank: pagerankMap,
                indegree: indegreeMap,
                communities: communitiesMap,
                communityCount: communitiesData?.data?.numCommunities,
                modularity: communitiesData?.data?.modularity,
                nodeCount: pagerankData?.numNodes ?? degreeData?.numNodes,
                edgeCount: pagerankData?.numEdges ?? degreeData?.numEdges,
                density: pagerankData ? pagerankData.numEdges / (pagerankData.numNodes * (pagerankData.numNodes - 1) || 1) : undefined,
                // DAG analysis
                depths: dagData?.data?.allDepths,
                layers: dagData?.data?.allDepths, // layers are same as depths
                bottleneckScores: dagData?.data?.allBottleneckScores,
                reachability: dagData?.data?.allReachability,
                graphDepth: dagData?.data?.graphDepth,
                numLayers: dagData?.data?.numLayers,
                sources: dagData?.data?.sources,
                sinks: dagData?.data?.sinks,
                criticalPath: dagData?.data?.criticalPath,
                // Spectral clustering
                spectralClusters: spectralData?.data?.clusters,
                numSpectralClusters: spectralData?.data?.numClusters,
                // Entropy
                vonNeumannEntropy: entropyData?.data?.vonNeumannEntropy,
                degreeShannon: entropyData?.data?.degreeShannon,
                structureEntropy: entropyData?.data?.structureEntropy,
            })
        } catch (error) {
            console.error('Analysis failed:', error)
        } finally {
            setAnalysisLoading(false)
        }
    }, [projectPath])

    // Auto-compute analysis when project loads (runs once per project)
    const analysisComputedRef = useRef<string | null>(null)
    useEffect(() => {
        if (projectPath && astrolabeNodes.length > 0 && analysisComputedRef.current !== projectPath) {
            analysisComputedRef.current = projectPath
            computeAnalysis()
        }
    }, [projectPath, astrolabeNodes.length, computeAnalysis])

    // Handle node click (adapted to Node type)
    const handleCanvasNodeClick = useCallback((node: Node | null) => {
        // Clear edge selection when clicking on a node
        setSelectedEdge(null)

        if (!node) {
            // Clicking empty area cancels add edge mode or delete mode
            if (isAddingEdge) {
                cancelAddingEdge()
            }
            if (isRemovingNodes) {
                setIsRemovingNodes(false)
            }
            setSelectedNode(null)
            // Close code viewer when deselecting (return to initial state)
            setCodeViewerOpen(false)
            return
        }

        // If in delete node mode, directly delete the node
        if (isRemovingNodes) {
            graphActions.removeNodeFromCanvas(node.id)
            // If deleting the currently selected node, clear selection state
            if (selectedNode?.id === node.id) {
                setSelectedNode(null)
            }
            return
        }

        // If in add edge mode, handle target node selection
        if (isAddingEdge && selectedNode) {
            handleAddCustomEdge(node.id)
            return
        }

        // Check if it's a namespace bubble (group node)
        if (node.id.startsWith('group:')) {
            // Extract namespace from group id (format: "group:Namespace.Path")
            const namespace = node.id.replace('group:', '')

            // Focus camera on the bubble immediately
            setFocusNodeId(node.id)

            // Fast path: check local cache first
            const cached = namespaceIndex.get(namespace)
            if (cached?.file_path && cached?.line_number) {
                console.log('[handleCanvasNodeClick] Using cached namespace location:', namespace)
                setCodeLocation({ filePath: cached.file_path, lineNumber: cached.line_number })
                setCodeViewerOpen(true)
                return
            }

            // Slow path: fetch from API (uses backend cache or LSP)
            const fetchNamespaceDeclaration = async () => {
                try {
                    const response = await fetch(
                        `http://127.0.0.1:8765/api/project/namespace-declaration?` +
                        `path=${encodeURIComponent(projectPath)}&namespace=${encodeURIComponent(namespace)}`
                    )
                    if (response.ok) {
                        const data = await response.json()
                        console.log('[handleCanvasNodeClick] Namespace declaration from API:', namespace, data)
                        return { filePath: data.file_path, lineNumber: data.line_number }
                    }
                } catch (error) {
                    console.log('[handleCanvasNodeClick] API failed, falling back:', error)
                }

                // Fallback: Find the earliest node in this namespace
                const nodesInNamespace = graphNodes
                    .filter(gn => gn.name.startsWith(namespace + '.') && gn.leanFilePath && gn.leanLineNumber)
                    .sort((a, b) => {
                        if (a.leanFilePath !== b.leanFilePath) {
                            return (a.leanFilePath || '').localeCompare(b.leanFilePath || '')
                        }
                        return (a.leanLineNumber || 0) - (b.leanLineNumber || 0)
                    })
                const firstNode = nodesInNamespace[0]
                console.log('[handleCanvasNodeClick] Fallback to first node:', firstNode?.name)
                return { filePath: firstNode?.leanFilePath, lineNumber: firstNode?.leanLineNumber }
            }

            // Start async fetch and update code viewer directly
            fetchNamespaceDeclaration().then(({ filePath, lineNumber }) => {
                if (filePath && lineNumber) {
                    setCodeLocation({ filePath, lineNumber })
                    setCodeViewerOpen(true)
                    console.log('[handleCanvasNodeClick] Opening code at:', filePath, lineNumber)
                }
            })
            return
        }

        // First check if it's a custom node
        const customNode = customNodes.find(cn => cn.id === node.id)
        if (customNode) {
            // Construct a GraphNode-like object for right panel display
            const fakeGraphNode: GraphNode = {
                id: customNode.id,
                name: customNode.name,
                type: 'custom',
                status: 'unknown',
                notes: customNode.notes,
                leanFilePath: undefined,
                leanLineNumber: undefined,
            }
            selectNode(fakeGraphNode)
            return
        }

        // Find the corresponding GraphNode
        const graphNode = graphNodes.find(gn => gn.id === node.id)
        if (graphNode) {
            selectNode(graphNode)
        }
    }, [graphNodes, customNodes, selectNode, setSelectedNode, isAddingEdge, selectedNode, handleAddCustomEdge, cancelAddingEdge, isRemovingNodes])

    // Show clear canvas dialog
    const handleClearCanvas = useCallback(() => {
        setSelectedNodesToRemove(new Set())
        setShowClearCanvasDialog(true)
    }, [])

    // Toggle selection of node to remove
    const toggleNodeToRemove = useCallback((nodeId: string) => {
        setSelectedNodesToRemove(prev => {
            const newSet = new Set(prev)
            if (newSet.has(nodeId)) {
                newSet.delete(nodeId)
            } else {
                newSet.add(nodeId)
            }
            return newSet
        })
    }, [])

    // Select all / deselect all
    const selectAllNodesToRemove = useCallback(() => {
        const allIds = canvasNodes.map(n => n.id)
        setSelectedNodesToRemove(new Set(allIds))
    }, [canvasNodes])

    const deselectAllNodesToRemove = useCallback(() => {
        setSelectedNodesToRemove(new Set())
    }, [])

    // Remove selected nodes
    const removeSelectedNodes = useCallback(async () => {
        for (const nodeId of selectedNodesToRemove) {
            await graphActions.removeNodeFromCanvas(nodeId)
        }
        setSelectedNodesToRemove(new Set())
        setSelectedNode(null)
        if (selectedNodesToRemove.size === canvasNodes.length) {
            setShowClearCanvasDialog(false)
        }
    }, [selectedNodesToRemove, setSelectedNode, canvasNodes.length])

    // Clear all nodes
    const clearAllNodes = useCallback(async () => {
        await graphActions.clearCanvas()
        setSelectedNode(null)
        setShowClearCanvasDialog(false)
    }, [setSelectedNode])

    // Show reset confirmation dialog
    const handleResetAllData = useCallback(() => {
        setShowResetConfirm(true)
    }, [])

    // Confirm reset all data
    const confirmResetAllData = useCallback(async () => {
        await resetAllData()
        setSelectedNode(null)
        setShowResetConfirm(false)
        // Show reload prompt
        setShowReloadPrompt(true)
    }, [resetAllData, setSelectedNode])

    // Handle creating custom node
    const handleCreateCustomNode = useCallback(async () => {
        const name = customNodeName.trim()
        if (!name) return

        // Generate ID (using timestamp to ensure uniqueness)
        const id = `custom-${Date.now()}`
        await graphActions.createCustomNode(id, name)

        setShowCustomNodeDialog(false)
        setCustomNodeName('')
        console.log('[page] Created custom node:', id, name)
    }, [customNodeName])

    // Handle search result selection - find the corresponding GraphNode and select it
    const handleSearchResultSelect = useCallback((result: SearchResult) => {
        // First check if it's a custom node
        if (result.kind === 'custom') {
            const customNode = customNodes.find(cn => cn.id === result.id)
            if (customNode) {
                // Construct a GraphNode-like object
                const fakeGraphNode: GraphNode = {
                    id: customNode.id,
                    name: customNode.name,
                    type: 'custom',
                    status: 'proven',
                    leanFilePath: '',
                    leanLineNumber: 0,
                    notes: customNode.notes || '',
                }
                selectNode(fakeGraphNode)
                setInfoPanelOpen(true)
                setFocusNodeId(customNode.id) // Focus on custom node
            }
            return
        }

        // Regular node - check if on canvas for focusing
        const isOnCanvas = visibleNodes.includes(result.id)
        const matchingNode = graphNodes.find(node => node.id === result.id)

        // Construct node info from SearchResult (works for all nodes, even filtered ones)
        const nodeToSelect: GraphNode = matchingNode || {
            id: result.id,
            name: result.name,
            type: result.kind as NodeKind,
            status: (result.status as any) || 'stated',
            leanFilePath: result.filePath,
            leanLineNumber: result.lineNumber,
            notes: '',
        }
        selectNode(nodeToSelect)
        setInfoPanelOpen(true)

        // Only focus if node is on canvas
        if (isOnCanvas) {
            setFocusNodeId(result.id)
        }
    }, [graphNodes, visibleNodes, selectNode])

    // Handle edge selection from 3D view (stable callback to prevent edge flickering)
    const handleEdgeSelect = useCallback((edge: { id: string; source: string; target: string } | null) => {
        if (!edge) {
            setSelectedEdge(null)
            // Save cleared edge selection to viewport
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: '' }).catch((err) => {
                    console.error('[page] Failed to clear selected edge:', err)
                })
            }
            return
        }
        // Find node names for display (check both graphNodes and customNodes)
        const sourceNode = graphNodes.find(n => n.id === edge.source) || customNodes.find(n => n.id === edge.source)
        const targetNode = graphNodes.find(n => n.id === edge.target) || customNodes.find(n => n.id === edge.target)
        // Find edge data for style/effect (check both astrolabeEdges and customEdges)
        const edgeData = astrolabeEdges.find(e => e.id === edge.id)
        const customEdge = customEdges.find(e => e.id === edge.id)
        // Toggle if same edge clicked
        if (selectedEdge?.id === edge.id) {
            setSelectedEdge(null)
            // Save cleared edge selection to viewport
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: '' }).catch((err) => {
                    console.error('[page] Failed to clear selected edge:', err)
                })
            }
        } else {
            setSelectedEdge({
                id: edge.id,
                source: edge.source,
                target: edge.target,
                sourceName: sourceNode?.name || edge.source,
                targetName: targetNode?.name || edge.target,
                style: edgeData?.style ?? customEdge?.style,
                effect: edgeData?.effect ?? customEdge?.effect,
                defaultStyle: edgeData?.defaultStyle ?? (customEdge ? 'dashed' : 'solid'),
                skippedNodes: edgeData?.skippedNodes,
            })
            // Focus on edge
            setFocusEdgeId(edge.id)
            // Open Edges tool panel to show edge style
            setToolPanelView('edges')
            // Set code location to source node (only update code viewer, not selectedNode)
            const sourceGraphNode = graphNodes.find(n => n.id === edge.source)
            if (sourceGraphNode?.leanFilePath && sourceGraphNode?.leanLineNumber) {
                setCodeLocation({
                    filePath: sourceGraphNode.leanFilePath,
                    lineNumber: sourceGraphNode.leanLineNumber,
                })
                setCodeViewerOpen(true)
            }
            // Save selected edge to viewport
            if (projectPath) {
                updateViewport(projectPath, { selected_edge_id: edge.id }).catch((err) => {
                    console.error('[page] Failed to save selected edge:', err)
                })
            }
        }
    }, [graphNodes, customNodes, astrolabeEdges, customEdges, selectedEdge, projectPath])

    // Unified node navigation function - handles GraphNode and CustomNode
    const navigateToNode = useCallback((nodeId: string) => {
        // First check if it's a CustomNode
        const customNode = customNodes.find(cn => cn.id === nodeId)
        if (customNode) {
            const fakeGraphNode: GraphNode = {
                id: customNode.id,
                name: customNode.name,
                type: 'custom',
                status: 'unknown',
                notes: customNode.notes,
                leanFilePath: undefined,
                leanLineNumber: undefined,
            }
            selectNode(fakeGraphNode)
            setFocusNodeId(customNode.id)
            return
        }

        // Regular node
        const graphNode = graphNodes.find(n => n.id === nodeId)
        if (graphNode) {
            selectNode(graphNode)
            setFocusNodeId(nodeId)
        }
    }, [graphNodes, customNodes, selectNode])

    if (!isTauri) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-mono text-white mb-4">Astrolabe</h1>
                    <p className="text-white/60 text-sm">Please run this application in Tauri desktop mode</p>
                </div>
            </div>
        )
    }

    if (!projectPath) {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-center">
                    <h1 className="text-2xl font-mono text-white mb-4">No Project Selected</h1>
                    <button
                        onClick={() => router.push('/')}
                        className="px-6 py-3 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
                    >
                        Go to Home
                    </button>
                </div>
            </div>
        )
    }

    // Non-Lean 4 Lake projects are not supported
    if (notSupported && projectStatus) {
        return (
            <div className="h-screen flex flex-col bg-black text-white">
                {/* Top Bar */}
                <div className="h-10 border-b border-white/10 bg-black/90 flex items-center px-3">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Home"
                    >
                        <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                    <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                </div>
                {/* Not Supported Panel */}
                <div className="flex-1 flex items-center justify-center">
                    <div className="max-w-lg text-center p-8">
                        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-yellow-500/20 flex items-center justify-center">
                            <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-2xl font-bold mb-4">Project Not Supported</h2>
                        <p className="text-white/60 mb-6">{projectStatus.message}</p>
                        <p className="text-sm text-white/40 mb-8">
                            Astrolabe currently only supports Lean 4 + Lake projects. Please ensure the project root contains <code className="bg-white/10 px-1.5 py-0.5 rounded">lakefile.lean</code> or <code className="bg-white/10 px-1.5 py-0.5 rounded">lakefile.toml</code>.
                        </p>
                        <button
                            onClick={() => router.push('/')}
                            className="px-6 py-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                        >
                            Back to Home
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Project needs initialization
    if (needsInit && projectStatus) {
        return (
            <div className="h-screen flex flex-col bg-black text-white">
                {/* Top Bar */}
                <div className="h-10 border-b border-white/10 bg-black/90 flex items-center px-3">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Home"
                    >
                        <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                    <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                </div>
                {/* Init Panel */}
                <ProjectInitPanel
                    projectPath={projectPath}
                    projectStatus={projectStatus}
                    onInitComplete={async () => {
                        // Recheck status and reload
                        await recheckStatus()
                        reloadGraph()
                    }}
                />
            </div>
        )
    }

    return (
        <div className="h-screen flex flex-col bg-black text-white">
            {/* Top Bar - minimal */}
            <div className="h-10 border-b border-white/10 bg-black/90 flex items-center justify-between px-3">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => router.push('/')}
                        className="p-1.5 hover:bg-white/10 rounded transition-colors"
                        title="Home"
                    >
                        <HomeIcon className="w-4 h-4 text-white/60 hover:text-white" />
                    </button>
                    <span className="text-sm font-mono text-white/60 ml-2">{projectName}</span>
                    <div className="w-px h-4 bg-white/20 ml-2" />
                    <LensIndicator onOpenLensPicker={openLensPicker} />
                </div>
                <div className="flex items-center gap-2">
                    {/* View mode switch - temporarily hidden, 2D in development */}
                    {/* <div className="flex bg-white/5 rounded overflow-hidden">
                        <button
                            onClick={() => setViewMode('3d')}
                            className={`px-2 py-1 text-xs transition-colors ${
                                viewMode === '3d' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'
                            }`}
                            title="3D Force Graph"
                        >
                            3D
                        </button>
                        <button
                            onClick={() => setViewMode('2d')}
                            className={`px-2 py-1 text-xs transition-colors ${
                                viewMode === '2d' ? 'bg-white/20 text-white' : 'text-white/40 hover:text-white'
                            }`}
                            title="2D Sigma Graph"
                        >
                            2D
                        </button>
                    </div>
                    <div className="w-px h-4 bg-white/20" /> */}
                    <button
                        onClick={() => setSearchPanelOpen(!searchPanelOpen)}
                        className={`p-1.5 rounded transition-colors ${
                            searchPanelOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title="Search Panel"
                    >
                        <MagnifyingGlassIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={() => setInfoPanelOpen(!infoPanelOpen)}
                        className={`p-1.5 rounded transition-colors ${
                            infoPanelOpen ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title="Node Info"
                    >
                        <CubeIcon className="w-4 h-4" />
                    </button>
                    <button
                        onClick={handleToggleCodeViewer}
                        className={`p-1.5 rounded transition-colors ${
                            codeViewerOpen ? 'bg-cyan-500/20 text-cyan-400' : 'bg-white/5 text-white/40 hover:text-white'
                        }`}
                        title="Code Viewer"
                    >
                        <CodeBracketIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 min-h-0 flex">
                {/* Main horizontal panel group: Left + Center + Right */}
                <PanelGroup direction="horizontal" className="flex-1">
                    {/* Left: Search/Settings panel */}
                    {searchPanelOpen && (
                        <>
                            <Panel defaultSize={18} minSize={15} maxSize={35}>
                                <div className="h-full flex flex-col bg-black border-r border-white/10">
                                    {/* Tab Header */}
                                    <div className="flex border-b border-white/10 shrink-0">
                                        <button
                                            onClick={() => setLeftPanelMode('search')}
                                            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                                                leftPanelMode === 'search'
                                                    ? 'text-white/90 bg-white/5'
                                                    : 'text-white/40 hover:text-white/60'
                                            }`}
                                        >
                                            Search
                                        </button>
                                        <button
                                            onClick={() => setLeftPanelMode('settings')}
                                            className={`flex-1 px-3 py-2.5 text-xs font-medium transition-colors ${
                                                leftPanelMode === 'settings'
                                                    ? 'text-white/90 bg-white/5'
                                                    : 'text-white/40 hover:text-white/60'
                                            }`}
                                        >
                                            Settings
                                        </button>
                                    </div>

                                    {/* Tab Content */}
                                    <div className="flex-1 overflow-hidden">
                                        {leftPanelMode === 'search' ? (
                                            <SearchPanel
                                                key={searchPanelKey}
                                                className="h-full"
                                                selectedNodeId={selectedNode?.id}
                                                onNodeSelect={handleSearchResultSelect}
                                            />
                                        ) : (
                                            <div className="h-full overflow-y-auto p-3 space-y-4">
                                                {/* === GRAPH SIMPLIFICATION === */}
                                                <div>
                                                    <button
                                                        onClick={() => toggleSection('graphSimplification')}
                                                        className="w-full flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                    >
                                                        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('graphSimplification') ? '-rotate-90' : ''}`} />
                                                        <FunnelIcon className="w-4 h-4" />
                                                        <span className="text-[10px] uppercase tracking-wider font-medium">Graph Simplification</span>
                                                    </button>
                                                    {!collapsedSections.has('graphSimplification') && (
                                                    <div className="space-y-2 ml-5 mt-1">
                                                        {/* Hide Technical */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filterOptions.hideTechnical}
                                                                    onChange={(e) => updateFilterOptionsUndoable({ ...filterOptions, hideTechnical: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Hide Technical</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('hideTechnical') ? next.delete('hideTechnical') : next.add('hideTechnical')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {/* Transitive Reduction */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filterOptions.transitiveReduction ?? true}
                                                                    onChange={(e) => updateFilterOptionsUndoable({ ...filterOptions, transitiveReduction: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Transitive Reduction</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('transitiveReduction') ? next.delete('transitiveReduction') : next.add('transitiveReduction')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                        {/* Hide Orphaned */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={filterOptions.hideOrphaned ?? false}
                                                                    onChange={(e) => updateFilterOptionsUndoable({ ...filterOptions, hideOrphaned: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Hide Orphaned</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('hideOrphaned') ? next.delete('hideOrphaned') : next.add('hideOrphaned')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    )}
                                                </div>

                                                {/* === LAYOUT OPTIMIZATION === */}
                                                {viewMode === '3d' && (
                                                    <div className="border-t border-white/10 pt-3">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => toggleSection('layoutOptimization')}
                                                                className="flex-1 flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                            >
                                                                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('layoutOptimization') ? '-rotate-90' : ''}`} />
                                                                <CubeTransparentIcon className="w-4 h-4" />
                                                                <span className="text-[10px] uppercase tracking-wider font-medium">Layout Optimization</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedInfoTips(prev => {
                                                                    const next = new Set(prev)
                                                                    next.has('layoutOptimization') ? next.delete('layoutOptimization') : next.add('layoutOptimization')
                                                                    return next
                                                                })}
                                                                className="text-white/30 hover:text-white/60 p-1"
                                                            >
                                                                <InformationCircleIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        {!collapsedSections.has('layoutOptimization') && (
                                                        <div className="ml-5 mt-1">
                                                        {/* Namespace Clustering */}
                                                        <div className="mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={physics.clusteringEnabled}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, clusteringEnabled: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Namespace Clustering</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('clustering') ? next.delete('clustering') : next.add('clustering')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {physics.clusteringEnabled && (
                                                                <div className="mt-2 ml-5 space-y-2">
                                                                    <div>
                                                                        <input
                                                                            type="range"
                                                                            min="0"
                                                                            max="10"
                                                                            step="0.5"
                                                                            value={physics.clusteringStrength}
                                                                            onChange={(e) => {
                                                                                const intensity = Number(e.target.value)
                                                                                updatePhysicsUndoable({
                                                                                    ...physics,
                                                                                    clusteringStrength: intensity,
                                                                                    clusterSeparation: intensity * 1.5
                                                                                })
                                                                            }}
                                                                            className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                        />
                                                                        <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                                                            <span>Loose</span>
                                                                            <span>Clustered</span>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <label className="text-[10px] text-white/40 mb-1 block">Depth</label>
                                                                        <select
                                                                            value={physics.clusteringDepth}
                                                                            onChange={(e) => updatePhysicsUndoable({ ...physics, clusteringDepth: Number(e.target.value) })}
                                                                            className="w-full text-[10px] bg-white/10 border border-white/20 rounded px-2 py-1 text-white/80"
                                                                        >
                                                                            {namespaceDepthPreview.map(info => (
                                                                                <option key={info.depth} value={info.depth}>
                                                                                    Depth {info.depth} ({info.count} groups)
                                                                                </option>
                                                                            ))}
                                                                            {namespaceDepthPreview.length === 0 && (
                                                                                <option value={1}>No namespaces found</option>
                                                                            )}
                                                                        </select>
                                                                        {/* Show full namespace list for selected depth - clickable to focus */}
                                                                        {namespaceDepthPreview.find(d => d.depth === physics.clusteringDepth) && (
                                                                            <div className="mt-2 p-2 bg-black/30 rounded text-[10px] max-h-24 overflow-y-auto">
                                                                                {namespaceDepthPreview.find(d => d.depth === physics.clusteringDepth)!.namespaces.map((ns, i) => {
                                                                                    const isOnCanvas = namespacesOnCanvas.has(ns)
                                                                                    return (
                                                                                        <button
                                                                                            key={i}
                                                                                            className={`block w-full text-left py-0.5 px-1 rounded transition-colors ${
                                                                                                isOnCanvas
                                                                                                    ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/20'
                                                                                                    : 'text-white/30 cursor-not-allowed'
                                                                                            }`}
                                                                                            onClick={() => isOnCanvas && handleNamespaceClick(ns)}
                                                                                            disabled={!isOnCanvas}
                                                                                            title={isOnCanvas ? `Focus on ${ns || '(root)'}` : 'No nodes on canvas'}
                                                                                        >
                                                                                            {isOnCanvas && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5" />}
                                                                                            {ns || '(root)'}
                                                                                        </button>
                                                                                    )
                                                                                })}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Community Clustering */}
                                                        <div className="mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={layoutClusterMode === 'community'}
                                                                    disabled={!analysisData.communities}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setLayoutClusterMode('community')
                                                                            updatePhysicsUndoable({ ...physics, communityAwareLayout: true })
                                                                        } else {
                                                                            setLayoutClusterMode('none')
                                                                            updatePhysicsUndoable({ ...physics, communityAwareLayout: false })
                                                                        }
                                                                    }}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40 disabled:opacity-30"
                                                                />
                                                                <span className={`text-xs ${analysisData.communities ? 'text-white/80' : 'text-white/40'}`}>Community Clustering</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('communityClustering') ? next.delete('communityClustering') : next.add('communityClustering')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                    title="Cluster by Louvain community detection"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {layoutClusterMode === 'community' && analysisData.communities && (
                                                                <div className="mt-2 ml-5">
                                                                    <input
                                                                        type="range"
                                                                        min="0"
                                                                        max="2.0"
                                                                        step="0.1"
                                                                        value={physics.communityClusteringStrength ?? 0.3}
                                                                        onChange={(e) => {
                                                                            const intensity = parseFloat(e.target.value)
                                                                            updatePhysicsUndoable({
                                                                                ...physics,
                                                                                communityClusteringStrength: intensity,
                                                                                communitySeparation: intensity * 1.5
                                                                            })
                                                                        }}
                                                                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                    />
                                                                    <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                                                        <span>Loose</span>
                                                                        <span>Clustered</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Layer Clustering */}
                                                        <div className="mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={layoutClusterMode === 'layer'}
                                                                    disabled={!analysisData.layers}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setLayoutClusterMode('layer')
                                                                            updatePhysicsUndoable({ ...physics, communityAwareLayout: true })
                                                                        } else {
                                                                            setLayoutClusterMode('none')
                                                                            updatePhysicsUndoable({ ...physics, communityAwareLayout: false })
                                                                        }
                                                                    }}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40 disabled:opacity-30"
                                                                />
                                                                <span className={`text-xs ${analysisData.layers ? 'text-white/80' : 'text-white/40'}`}>Layer Clustering</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('layerClustering') ? next.delete('layerClustering') : next.add('layerClustering')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                    title="Cluster by topological depth"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {layoutClusterMode === 'layer' && analysisData.layers && (
                                                                <div className="mt-2 ml-5">
                                                                    <input
                                                                        type="range"
                                                                        min="0"
                                                                        max="2.0"
                                                                        step="0.1"
                                                                        value={physics.communityClusteringStrength ?? 0.3}
                                                                        onChange={(e) => {
                                                                            const intensity = parseFloat(e.target.value)
                                                                            updatePhysicsUndoable({
                                                                                ...physics,
                                                                                communityClusteringStrength: intensity,
                                                                                communitySeparation: intensity * 1.5
                                                                            })
                                                                        }}
                                                                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                    />
                                                                    <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                                                        <span>Loose</span>
                                                                        <span>Clustered</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Spectral Clustering */}
                                                        <div className="mb-3">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={layoutClusterMode === 'spectral'}
                                                                    disabled={!analysisData.spectralClusters}
                                                                    onChange={(e) => {
                                                                        if (e.target.checked) {
                                                                            setLayoutClusterMode('spectral')
                                                                            updatePhysicsUndoable({ ...physics, communityAwareLayout: true })
                                                                        } else {
                                                                            setLayoutClusterMode('none')
                                                                            updatePhysicsUndoable({ ...physics, communityAwareLayout: false })
                                                                        }
                                                                    }}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40 disabled:opacity-30"
                                                                />
                                                                <span className={`text-xs ${analysisData.spectralClusters ? 'text-white/80' : 'text-white/40'}`}>Spectral Clustering</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('spectralClustering') ? next.delete('spectralClustering') : next.add('spectralClustering')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                    title="Cluster by graph Laplacian eigenvectors"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {layoutClusterMode === 'spectral' && analysisData.spectralClusters && (
                                                                <div className="mt-2 ml-5">
                                                                    <input
                                                                        type="range"
                                                                        min="0"
                                                                        max="2.0"
                                                                        step="0.1"
                                                                        value={physics.communityClusteringStrength ?? 0.3}
                                                                        onChange={(e) => {
                                                                            const intensity = parseFloat(e.target.value)
                                                                            updatePhysicsUndoable({
                                                                                ...physics,
                                                                                communityClusteringStrength: intensity,
                                                                                communitySeparation: intensity * 1.5
                                                                            })
                                                                        }}
                                                                        className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                    />
                                                                    <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                                                        <span>Loose</span>
                                                                        <span>Clustered</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>

                                                        {/* Adaptive Springs */}
                                                        <div className="mt-3">
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={physics.adaptiveSpringEnabled}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, adaptiveSpringEnabled: e.target.checked })}
                                                                    className="rounded bg-white/20 border-white/30 text-white/80 focus:ring-white/40"
                                                                />
                                                                <span className="text-xs text-white/80">Adaptive Springs</span>
                                                                <button
                                                                    onClick={() => setExpandedInfoTips(prev => {
                                                                        const next = new Set(prev)
                                                                        next.has('adaptiveSprings') ? next.delete('adaptiveSprings') : next.add('adaptiveSprings')
                                                                        return next
                                                                    })}
                                                                    className="ml-auto text-white/30 hover:text-white/60"
                                                                >
                                                                    <InformationCircleIcon className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                            {physics.adaptiveSpringEnabled && (
                                                                <div className="mt-2 ml-5 space-y-2">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-white/40 w-14">Mode</span>
                                                                        <select
                                                                            value={physics.adaptiveSpringMode}
                                                                            onChange={(e) => updatePhysicsUndoable({ ...physics, adaptiveSpringMode: e.target.value as 'sqrt' | 'logarithmic' | 'linear' })}
                                                                            className="flex-1 text-[10px] bg-white/10 border border-white/20 rounded px-2 py-0.5 text-white/80"
                                                                        >
                                                                            <option value="sqrt">Square Root</option>
                                                                            <option value="logarithmic">Logarithmic</option>
                                                                            <option value="linear">Linear</option>
                                                                        </select>
                                                                    </div>
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-[10px] text-white/40 w-14">Scale</span>
                                                                        <input
                                                                            type="range"
                                                                            min="0"
                                                                            max="10"
                                                                            step="0.5"
                                                                            value={physics.adaptiveSpringScale}
                                                                            onChange={(e) => updatePhysicsUndoable({ ...physics, adaptiveSpringScale: Number(e.target.value) })}
                                                                            className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                        />
                                                                        <span className="text-[10px] text-white/60 w-6 text-right">{physics.adaptiveSpringScale.toFixed(1)}</span>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                        </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* === PHYSICS === */}
                                                {viewMode === '3d' && (
                                                    <div className="border-t border-white/10 pt-3">
                                                        <div className="flex items-center gap-1">
                                                            <button
                                                                onClick={() => toggleSection('physics')}
                                                                className="flex-1 flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                            >
                                                                <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('physics') ? '-rotate-90' : ''}`} />
                                                                <BoltIcon className="w-4 h-4" />
                                                                <span className="text-[10px] uppercase tracking-wider font-medium">Physics</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedInfoTips(prev => {
                                                                    const next = new Set(prev)
                                                                    next.has('physics') ? next.delete('physics') : next.add('physics')
                                                                    return next
                                                                })}
                                                                className="text-white/30 hover:text-white/60 p-1"
                                                            >
                                                                <InformationCircleIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        {!collapsedSections.has('physics') && (
                                                        <div className="space-y-1.5 ml-5 mt-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Repulsion</span>
                                                                <input
                                                                    type="range"
                                                                    min="10"
                                                                    max="500"
                                                                    step="10"
                                                                    value={physics.repulsionStrength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, repulsionStrength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.repulsionStrength}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Edge Length</span>
                                                                <input
                                                                    type="range"
                                                                    min="1"
                                                                    max="20"
                                                                    step="0.5"
                                                                    value={physics.springLength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, springLength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.springLength}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Edge Tension</span>
                                                                <input
                                                                    type="range"
                                                                    min="0.1"
                                                                    max="10"
                                                                    step="0.1"
                                                                    value={physics.springStrength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, springStrength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.springStrength.toFixed(1)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Gravity</span>
                                                                <input
                                                                    type="range"
                                                                    min="0"
                                                                    max="5"
                                                                    step="0.1"
                                                                    value={physics.centerStrength}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, centerStrength: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.centerStrength.toFixed(1)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Damping</span>
                                                                <input
                                                                    type="range"
                                                                    min="0.3"
                                                                    max="0.95"
                                                                    step="0.05"
                                                                    value={physics.damping}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, damping: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.damping.toFixed(2)}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-white/50 w-20">Boundary</span>
                                                                <input
                                                                    type="range"
                                                                    min="5"
                                                                    max="200"
                                                                    step="5"
                                                                    value={physics.boundaryRadius ?? 50}
                                                                    onChange={(e) => updatePhysicsUndoable({ ...physics, boundaryRadius: Number(e.target.value) })}
                                                                    className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
                                                                />
                                                                <span className="text-[10px] text-white/60 w-8 text-right">{physics.boundaryRadius ?? 50}</span>
                                                            </div>
                                                        </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* === ANALYSIS === */}
                                                <div className="border-t border-white/10 pt-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => toggleSection('analysis')}
                                                            className="flex-1 flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                        >
                                                            <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('analysis') ? '-rotate-90' : ''}`} />
                                                            <ChartBarIcon className="w-4 h-4" />
                                                            <span className="text-[10px] uppercase tracking-wider font-medium">Network Analysis</span>
                                                            {analysisLoading && (
                                                                <div className="w-3 h-3 border-2 border-purple-300/30 border-t-purple-300 rounded-full animate-spin" />
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => setExpandedInfoTips(prev => {
                                                                const next = new Set(prev)
                                                                next.has('analysisStats') ? next.delete('analysisStats') : next.add('analysisStats')
                                                                return next
                                                            })}
                                                            className="text-white/30 hover:text-white/60"
                                                        >
                                                            <InformationCircleIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    {/* Centered Modal Info */}
                                                    {expandedInfoTips.has('analysisStats') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => {
                                                                const next = new Set(prev)
                                                                next.delete('analysisStats')
                                                                return next
                                                            })}
                                                        >
                                                            <div
                                                                className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-xl w-full mx-4 max-h-[80vh] overflow-y-auto"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <h2 className="text-lg text-white font-medium mb-3">Network Analysis</h2>
                                                                <p className="text-sm text-white/60 mb-4">
                                                                    Analyze the dependency graph structure using graph theory metrics.
                                                                    Use <strong className="text-white/80">Size Mapping</strong> to visualize node importance,
                                                                    and <strong className="text-white/80">Color Mapping</strong> to highlight community structure.
                                                                </p>
                                                                <div className="space-y-2">
                                                                    {/* Graph Density */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">Graph Density</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$D = \\frac{|E|}{|V| \\cdot (|V| - 1)}$$

where $|E|$ = number of edges, $|V|$ = number of nodes.

Ratio of actual edges to maximum possible edges. Higher = more interconnected.`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* PageRank */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">PageRank</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$PR(u) = \\frac{1-d}{N} + d \\sum_{v \\in B_u} \\frac{PR(v)}{L(v)}$$

- $PR(u)$ = PageRank of node $u$
- $d = 0.85$ = damping factor
- $N$ = total number of nodes
- $B_u$ = set of nodes linking to $u$
- $L(v)$ = outbound links from $v$

A node is important if referenced by other important nodes.`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* In-degree */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">In-degree Centrality</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$\\deg^{-}(v) = |\\{u : (u,v) \\in E\\}|$$

Count of incoming edges. High in-degree = widely used/depended upon.`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* Community Detection */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">Community Detection (Louvain)</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$Q = \\frac{1}{2m} \\sum_{ij} \\left[ A_{ij} - \\frac{k_i k_j}{2m} \\right] \\delta(c_i, c_j)$$

- $Q$ = modularity $\\in [0,1]$
- $m$ = total edges
- $A_{ij}$ = adjacency matrix
- $k_i, k_j$ = node degrees
- $\\delta(c_i, c_j)$ = 1 if same community

Groups densely connected nodes. Higher $Q$ = better separation.`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* Dependency Depth */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">Dependency Depth</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$\\text{depth}(v) = \\max_{u \\in \\text{ancestors}(v)} d(u, v)$$

Longest path from any root (axiom/definition) to the node.

- **Depth 0**: Axioms, definitions (no dependencies)
- **Higher depth**: More abstract theorems

Useful for understanding proof "height" in the abstraction hierarchy.`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* Bottleneck Score */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">Bottleneck Score</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$\\text{bottleneck}(v) = \\frac{|\\text{descendants}(v)|}{|\\text{ancestors}(v)|}$$

Ratio of nodes depending on $v$ to nodes $v$ depends on.

- **High score**: Foundational lemma (many depend on it, it depends on few)
- **Score = 0**: Terminal theorem (no dependents)

Identifies key "building blocks" in the proof structure.`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* Reachability */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">Reachability Count</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`$$\\text{reach}(v) = |\\{u : u \\text{ is reachable from } v\\}|$$

Number of nodes transitively depending on this node.

- **High reachability**: Breaking this would affect many theorems
- **Low reachability**: Leaf or specialized result

Impact analysis: "How many results depend on this lemma?"`} />
                                                                        </div>
                                                                    </details>
                                                                    {/* Spectral Clustering */}
                                                                    <details className="group">
                                                                        <summary className="cursor-pointer text-white/80 hover:text-white py-2 px-3 bg-white/5 rounded-lg flex items-center gap-2">
                                                                            <ChevronDownIcon className="w-4 h-4 transition-transform group-open:rotate-180" />
                                                                            <span className="font-medium">Spectral Clustering</span>
                                                                        </summary>
                                                                        <div className="mt-2 ml-6 pb-2">
                                                                            <MarkdownRenderer content={`Uses graph Laplacian eigenvectors:
$$L = D - A$$

The **Fiedler vector** (2nd smallest eigenvalue) partitions the graph.

May reveal structure that Louvain misses, especially for:
- Sparse connections between dense clusters
- Hierarchical module boundaries`} />
                                                                        </div>
                                                                    </details>
                                                                </div>
                                                                {/* Graph Statistics */}
                                                                {(analysisData.density !== undefined || analysisData.vonNeumannEntropy !== undefined) && (
                                                                    <div className="mt-4 pt-4 border-t border-white/10">
                                                                        <h3 className="text-sm font-medium text-white/80 mb-2">Graph Statistics</h3>
                                                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                                                            {analysisData.nodeCount !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Nodes</div>
                                                                                    <div className="text-white font-medium">{analysisData.nodeCount.toLocaleString()}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.edgeCount !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Edges</div>
                                                                                    <div className="text-white font-medium">{analysisData.edgeCount.toLocaleString()}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.density !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Density</div>
                                                                                    <div className="text-white font-medium">{(analysisData.density * 100).toFixed(4)}%</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.communityCount !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Communities</div>
                                                                                    <div className="text-white font-medium">{analysisData.communityCount}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.modularity !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Modularity Q</div>
                                                                                    <div className="text-white font-medium">{analysisData.modularity.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.vonNeumannEntropy !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Von Neumann Entropy</div>
                                                                                    <div className="text-white font-medium">{analysisData.vonNeumannEntropy.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.degreeShannon !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Degree Shannon Entropy</div>
                                                                                    <div className="text-white font-medium">{analysisData.degreeShannon.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                            {analysisData.structureEntropy !== undefined && (
                                                                                <div className="bg-white/5 rounded px-3 py-2">
                                                                                    <div className="text-white/40 text-xs">Structure Entropy</div>
                                                                                    <div className="text-white font-medium">{analysisData.structureEntropy.toFixed(4)}</div>
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                {/* DAG Statistics Summary */}
                                                                {analysisData.graphDepth !== undefined && (
                                                                    <div className="mt-4 pt-4 border-t border-white/10">
                                                                        <h3 className="text-sm font-medium text-white/80 mb-2">DAG Statistics</h3>
                                                                        <div className="grid grid-cols-2 gap-2 text-sm">
                                                                            <div className="bg-white/5 rounded px-3 py-2">
                                                                                <div className="text-white/40 text-xs">Graph Depth</div>
                                                                                <div className="text-white font-medium">{analysisData.graphDepth}</div>
                                                                            </div>
                                                                            <div className="bg-white/5 rounded px-3 py-2">
                                                                                <div className="text-white/40 text-xs">Layers</div>
                                                                                <div className="text-white font-medium">{analysisData.numLayers}</div>
                                                                            </div>
                                                                            <div className="bg-white/5 rounded px-3 py-2">
                                                                                <div className="text-white/40 text-xs">Sources (Axioms)</div>
                                                                                <div className="text-white font-medium">{analysisData.sources?.length ?? 0}</div>
                                                                            </div>
                                                                            <div className="bg-white/5 rounded px-3 py-2">
                                                                                <div className="text-white/40 text-xs">Sinks (Terminals)</div>
                                                                                <div className="text-white font-medium">{analysisData.sinks?.length ?? 0}</div>
                                                                            </div>
                                                                        </div>
                                                                        {analysisData.criticalPath && analysisData.criticalPath.length > 0 && (
                                                                            <div className="mt-2 bg-white/5 rounded px-3 py-2">
                                                                                <div className="text-white/40 text-xs mb-1">Critical Path ({analysisData.criticalPath.length} nodes)</div>
                                                                                <div className="text-white/60 text-xs font-mono truncate">
                                                                                    {analysisData.criticalPath.slice(0, 3).join(' → ')}
                                                                                    {analysisData.criticalPath.length > 3 && ` → ... → ${analysisData.criticalPath[analysisData.criticalPath.length - 1]}`}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                )}
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">
                                                                    Click anywhere to close
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {/* Other Info Modals */}
                                                    {expandedInfoTips.has('hideTechnical') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('hideTechnical'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Hide Technical Nodes</h2>
                                                                <p className="text-sm text-white/70">Hide auto-generated Lean nodes that are typically implementation details:</p>
                                                                <ul className="mt-3 text-sm text-white/60 space-y-1 list-disc list-inside">
                                                                    <li>Type class instances</li>
                                                                    <li>Coercions</li>
                                                                    <li>Decidability proofs</li>
                                                                    <li>Other compiler-generated nodes</li>
                                                                </ul>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('transitiveReduction') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('transitiveReduction'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Transitive Reduction</h2>
                                                                <p className="text-sm text-white/70 mb-3">Remove redundant edges to show only essential dependencies.</p>
                                                                <div className="bg-white/5 rounded-lg p-3 text-sm text-white/60">
                                                                    <p className="font-medium text-white/80 mb-2">Example:</p>
                                                                    <p>If path exists: A → B → C</p>
                                                                    <p>Then hide direct edge: A → C</p>
                                                                </div>
                                                                <p className="text-sm text-white/50 mt-3">This reveals the true hierarchical structure of dependencies.</p>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('hideOrphaned') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('hideOrphaned'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Hide Orphaned Nodes</h2>
                                                                <p className="text-sm text-white/70">Hide nodes that have no connections to other visible nodes.</p>
                                                                <p className="text-sm text-white/50 mt-3">Useful for cleaning up isolated nodes that don&apos;t contribute to the dependency structure.</p>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('layoutOptimization') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('layoutOptimization'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Layout Optimization</h2>
                                                                <p className="text-sm text-white/70 mb-3">
                                                                    Apply additional forces to organize the graph layout beyond basic physics.
                                                                </p>
                                                                <ul className="text-sm text-white/60 space-y-2">
                                                                    <li><strong className="text-white/80">Namespace Clustering:</strong> Group nodes by Lean module hierarchy</li>
                                                                    <li><strong className="text-white/80">Community Clustering:</strong> Group by detected graph communities (Louvain)</li>
                                                                    <li><strong className="text-white/80">Adaptive Springs:</strong> Longer edges for high-degree hub nodes</li>
                                                                </ul>
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('clustering') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('clustering'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Namespace Clustering</h2>
                                                                <p className="text-sm text-white/70 mb-4">Group nodes by their Lean namespace hierarchy. Nodes in the same module cluster together.</p>
                                                                <MarkdownRenderer content={`**Force Model:**

$$F_{attract} = \\frac{k}{d^2 + 1}$$

$$F_{repel} = \\frac{s}{d^2 + 1}$$

where:
- $k$ = clustering strength
- $s$ = cluster separation
- $d$ = distance to/from centroid

**Depth** controls the namespace level used for grouping (e.g., depth 2 groups \`Mathlib.Algebra\` separately from \`Mathlib.Analysis\`).`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('adaptiveSprings') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('adaptiveSprings'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Adaptive Edge Length</h2>
                                                                <p className="text-sm text-white/70 mb-4">High-degree hub nodes get longer edges automatically, preventing star-shaped clustering.</p>
                                                                <MarkdownRenderer content={`**Modes:**

**Square Root** (recommended):
$$L = L_0 + s \\cdot \\sqrt{\\deg(v)}$$

**Logarithmic** (gentler scaling):
$$L = L_0 + s \\cdot \\ln(\\deg(v) + 1)$$

**Linear** (aggressive):
$$L = L_0 + s \\cdot \\deg(v)$$

where:
- $L$ = final edge length
- $L_0$ = base edge length
- $s$ = scale factor
- $\\deg(v)$ = degree of the hub node`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('communityClustering') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('communityClustering'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Graph-Based Clustering</h2>
                                                                <p className="text-sm text-white/70 mb-4">Group nodes by graph structure. The clustering method depends on your Color Mapping selection:</p>
                                                                <MarkdownRenderer content={`**Clustering Methods:**

- **Community** (Louvain): Groups densely connected nodes. Best for finding modules.
- **Layer** (Topological): Groups by dependency depth. Nodes at same "level" cluster together.
- **Spectral** (Laplacian): Uses eigenvectors of graph Laplacian. May find hidden structure.

**Force Model:**

Nodes in the same cluster attract each other:

$$F_{attract} = \\frac{k}{d^2 + 1}$$

Different clusters repel:

$$F_{repel} = \\frac{s}{d^2 + 1}$$

**Usage:** Select clustering type in Color Mapping, then enable here.`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {expandedInfoTips.has('physics') && (
                                                        <div
                                                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                                                            onClick={() => setExpandedInfoTips(prev => { const next = new Set(prev); next.delete('physics'); return next })}
                                                        >
                                                            <div className="bg-gray-900 border border-white/20 rounded-xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                                                                <h2 className="text-lg text-white font-medium mb-3">Physics Simulation</h2>
                                                                <p className="text-sm text-white/70 mb-4">Force-directed layout using a physics simulation.</p>
                                                                <MarkdownRenderer content={`**Forces:**

**Repulsion** (between all nodes):
$$F_r = \\frac{k_r}{d^2}$$

**Spring** (between connected nodes):
$$F_s = k_s \\cdot (d - L_0)$$

**Center Gravity**:
$$F_c = k_c \\cdot d_{center}$$

**Parameters:**
- *Repulsion*: How strongly nodes push each other apart
- *Edge Length*: Target distance between connected nodes
- *Edge Tension*: How strongly edges pull nodes together
- *Center Gravity*: Pull towards graph center
- *Damping*: Velocity decay (higher = faster settling)
- *Boundary*: Maximum distance from center`} />
                                                                <div className="text-xs text-white/30 pt-3 mt-3 border-t border-white/10 text-center">Click anywhere to close</div>
                                                            </div>
                                                        </div>
                                                    )}
                                                    {!collapsedSections.has('analysis') && (
                                                    <div className="ml-5 mt-2 space-y-3">
                                                        {/* Size Mapping */}
                                                        <div>
                                                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Size Mapping</label>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {([
                                                                    { mode: 'default' as const, label: 'Default', data: true, tooltip: 'Uniform node size' },
                                                                    { mode: 'pagerank' as const, label: 'PageRank', data: analysisData.pagerank, tooltip: 'Size by importance (referenced by important nodes)' },
                                                                    { mode: 'indegree' as const, label: 'In-deg', data: analysisData.indegree, tooltip: 'Size by number of incoming edges (how many depend on it)' },
                                                                    { mode: 'depth' as const, label: 'Depth', data: analysisData.depths, tooltip: 'Size by dependency depth (distance from axioms)' },
                                                                    { mode: 'bottleneck' as const, label: 'Bottleneck', data: analysisData.bottleneckScores, tooltip: 'Size by bottleneck score (dependents / dependencies ratio)' },
                                                                    { mode: 'reachability' as const, label: 'Reach', data: analysisData.reachability, tooltip: 'Size by reachability (how many nodes depend on this transitively)' },
                                                                ]).map(({ mode, label, data, tooltip }) => (
                                                                    <button
                                                                        key={mode}
                                                                        title={tooltip}
                                                                        onClick={() => setSizeMappingMode(mode)}
                                                                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                                                            sizeMappingMode === mode
                                                                                ? 'bg-blue-500/30 text-blue-300'
                                                                                : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                                        } ${!data ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        disabled={!data}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Color Mapping */}
                                                        <div>
                                                            <label className="text-[10px] text-white/40 uppercase tracking-wider">Color Mapping</label>
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {([
                                                                    { mode: 'kind' as const, label: 'Kind', data: true, tooltip: 'Color by node type (theorem, lemma, def, etc.)' },
                                                                    { mode: 'namespace' as const, label: 'Namespace', data: namespaceData, tooltip: 'Color by top-level namespace (e.g., Mathlib, Init)' },
                                                                    { mode: 'community' as const, label: 'Community', data: analysisData.communities, tooltip: 'Color by Louvain community detection' },
                                                                    { mode: 'layer' as const, label: 'Layer', data: analysisData.layers, tooltip: 'Color by topological layer (dependency depth)' },
                                                                    { mode: 'spectral' as const, label: 'Spectral', data: analysisData.spectralClusters, tooltip: 'Color by spectral clustering (graph Laplacian)' },
                                                                ]).map(({ mode, label, data, tooltip }) => (
                                                                    <button
                                                                        key={mode}
                                                                        title={tooltip}
                                                                        onClick={() => setColorMappingMode(mode)}
                                                                        className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                                                            colorMappingMode === mode
                                                                                ? 'bg-blue-500/30 text-blue-300'
                                                                                : 'bg-white/10 text-white/60 hover:bg-white/20'
                                                                        } ${!data ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                                        disabled={!data}
                                                                    >
                                                                        {label}
                                                                    </button>
                                                                ))}
                                                            </div>
                                                        </div>

                                                        {/* Size Contrast slider - only show when PageRank or In-degree is active */}
                                                        {sizeMappingMode !== 'default' && (
                                                            <div>
                                                                <input
                                                                    type="range"
                                                                    min="0"
                                                                    max="1"
                                                                    step="0.1"
                                                                    value={sizeContrast}
                                                                    onChange={(e) => setSizeContrast(parseFloat(e.target.value))}
                                                                    className="w-full h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                                                />
                                                                <div className="flex justify-between text-[9px] text-white/30 mt-1">
                                                                    <span>Uniform</span>
                                                                    <span>Contrast</span>
                                                                </div>
                                                            </div>
                                                        )}

                                                    </div>
                                                    )}
                                                </div>

                                                {/* === ACTIONS === */}
                                                <div className="border-t border-white/10 pt-3">
                                                    <button
                                                        onClick={() => toggleSection('actions')}
                                                        className="w-full flex items-center gap-2 py-1.5 text-white/60 hover:text-white/80 transition-colors group"
                                                    >
                                                        <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${collapsedSections.has('actions') ? '-rotate-90' : ''}`} />
                                                        <WrenchScrewdriverIcon className="w-4 h-4" />
                                                        <span className="text-[10px] uppercase tracking-wider font-medium">Actions</span>
                                                    </button>
                                                    {!collapsedSections.has('actions') && (
                                                    <div className="ml-5 mt-1 space-y-2">
                                                    {viewMode === '3d' && (
                                                        <button
                                                            onClick={() => updatePhysicsUndoable({ ...DEFAULT_PHYSICS })}
                                                            className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                                        >
                                                            Reset Physics
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={async () => {
                                                            // Load all nodes from graph into canvas
                                                            const allNodeIds = astrolabeNodes.map(n => n.id)
                                                            await graphActions.addNodesToCanvas(allNodeIds)
                                                        }}
                                                        disabled={astrolabeNodes.length === 0 || visibleNodes.length === astrolabeNodes.length}
                                                        className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        Load All Nodes ({astrolabeNodes.length})
                                                    </button>
                                                    <button
                                                        onClick={handleClearCanvas}
                                                        disabled={canvasNodes.length === 0}
                                                        className="w-full py-1.5 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                    >
                                                        Clear Canvas
                                                    </button>
                                                    <button
                                                        onClick={handleResetAllData}
                                                        className="w-full py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                                                    >
                                                        Reset All Data
                                                    </button>
                                                    <p className="text-[10px] text-white/30 text-center">
                                                        Reset deletes all custom nodes, edges & metadata
                                                    </p>
                                                    </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Panel>
                            <PanelResizeHandle className="w-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
                                <div className="h-12 w-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                            </PanelResizeHandle>
                        </>
                    )}

                    {/* Center: Graph */}
                    <Panel defaultSize={75} minSize={50}>
                        {/* Graph - Main Area */}
                        <div className="h-full w-full overflow-hidden relative bg-[#0a0a0f]">
                            {/* Render different graph components based on view mode */}
                            {!positionsLoaded ? (
                                <div className="h-full flex items-center justify-center text-white/40">
                                    Loading canvas...
                                </div>
                            ) : canvasNodes.length === 0 && visibleCustomNodes.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-white/40">
                                    <div className="text-lg mb-2">Canvas is empty</div>
                                    <div className="text-sm">Search and add nodes from the left panel</div>
                                </div>
                            ) : viewMode === '3d' ? (
                                <ForceGraph3D
                                    nodes={canvasNodes}
                                    edges={canvasEdges}
                                    customNodes={visibleCustomNodes}
                                    customEdges={visibleCustomEdges}
                                    selectedNodeId={selectedNode?.id}
                                    focusNodeId={focusNodeId}
                                    focusEdgeId={focusEdgeId}
                                    focusClusterPosition={focusClusterPosition}
                                    highlightedEdge={selectedEdge ? {
                                        id: selectedEdge.id,
                                        source: selectedEdge.source,
                                        target: selectedEdge.target
                                    } : null}
                                    highlightedNamespace={highlightedNamespace}
                                    onNodeSelect={(node) => {
                                        // Only clear namespace highlight if clicking a node outside the highlighted namespace
                                        if (highlightedNamespace && node && !highlightedNamespace.nodeIds.has(node.id)) {
                                            clearHighlightUndoable()
                                            setFocusClusterPosition(null)
                                        }
                                        handleCanvasNodeClick(node)
                                    }}
                                    onBackgroundClick={() => {
                                        clearHighlightUndoable() // Clear namespace highlight when clicking empty area
                                        setFocusClusterPosition(null) // Clear cluster focus
                                    }}
                                    onEdgeSelect={handleEdgeSelect}
                                    showLabels={showLabels}
                                    initialCameraPosition={initialViewport?.camera_position}
                                    initialCameraTarget={initialViewport?.camera_target}
                                    onCameraChange={handleCameraChange}
                                    physics={physics}
                                    isAddingEdge={isAddingEdge}
                                    isRemovingNodes={isRemovingNodes}
                                    nodesWithHiddenNeighbors={nodesWithHiddenNeighbors}
                                    getPositionsRef={getPositionsRef}
                                    nodeCommunities={nodeCommunities}
                                    onJumpToCode={(filePath, lineNumber) => {
                                        setCodeLocation({ filePath, lineNumber })
                                        setCodeViewerOpen(true)
                                    }}
                                    onJumpToNamespace={async (namespace) => {
                                        // Fetch namespace declaration from LSP API
                                        try {
                                            const response = await fetch(
                                                `http://127.0.0.1:8765/api/project/namespace-declaration?` +
                                                `path=${encodeURIComponent(projectPath)}&namespace=${encodeURIComponent(namespace)}`
                                            )
                                            if (response.ok) {
                                                const data = await response.json()
                                                console.log('[onJumpToNamespace] LSP result:', namespace, data)
                                                setCodeLocation({ filePath: data.file_path, lineNumber: data.line_number })
                                                setCodeViewerOpen(true)
                                                return
                                            }
                                        } catch (error) {
                                            console.log('[onJumpToNamespace] LSP API failed:', error)
                                        }
                                        // Fallback: find first node in namespace
                                        const firstNode = graphNodes
                                            .filter(n => n.name.startsWith(namespace + '.') && n.leanFilePath && n.leanLineNumber)
                                            .sort((a, b) => (a.leanLineNumber || 0) - (b.leanLineNumber || 0))[0]
                                        if (firstNode?.leanFilePath && firstNode?.leanLineNumber) {
                                            setCodeLocation({ filePath: firstNode.leanFilePath, lineNumber: firstNode.leanLineNumber })
                                            setCodeViewerOpen(true)
                                        }
                                    }}
                                />
                            ) : (
                                <SigmaGraph
                                    nodes={canvasNodes}
                                    edges={canvasEdges}
                                    projectPath={projectPath}
                                    onNodeClick={handleCanvasNodeClick}
                                    onEdgeSelect={handleEdgeSelect}
                                    selectedNodeId={selectedNode?.id}
                                    focusNodeId={focusNodeId}
                                    highlightedEdge={selectedEdge ? {
                                        id: selectedEdge.id,
                                        source: selectedEdge.source,
                                        target: selectedEdge.target
                                    } : null}
                                    showLabels={showLabels}
                                />
                            )}

                            {/* Loading Overlay */}
                            {graphLoading && (
                                <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-20">
                                    <div className="w-8 h-8 border-2 border-white/20 border-t-blue-400 rounded-full animate-spin mb-4" />
                                    <div className="text-white/80 text-sm font-mono">Loading project...</div>
                                    <div className="text-white/40 text-xs mt-2">Parsing Lean files</div>
                                </div>
                            )}

                            {/* Canvas toolbar - top left corner */}
                            <div className="absolute top-3 left-3 z-10 flex gap-2">
                                <div className="bg-black/60 px-3 py-1.5 rounded text-xs text-white/60 font-mono">
                                    <div>{canvasNodes.length} / {graphNodes.length} nodes</div>
                                    {filterOptions.hideTechnical && (filterStats.removedNodes > 0 || filterStats.orphanedNodes > 0) && (
                                        <div className="text-yellow-400/60 text-[10px]" title={`${filterStats.removedNodes} technical, ${filterStats.orphanedNodes} orphaned`}>
                                            ({filterStats.removedNodes + filterStats.orphanedNodes} hidden)
                                        </div>
                                    )}
                                </div>

                                {/* LSP button - build/refresh namespace index */}
                                <button
                                    onClick={handleBuildLsp}
                                    disabled={lspBuilding || graphLoading}
                                    className={`p-1.5 rounded transition-colors disabled:opacity-50 ${
                                        namespaceIndex.size > 0
                                            ? 'bg-green-900/60 hover:bg-green-800/60'
                                            : 'bg-black/60 hover:bg-white/20'
                                    }`}
                                    title={namespaceIndex.size > 0
                                        ? `${namespaceIndex.size} namespaces cached`
                                        : 'Load LSP'
                                    }
                                >
                                    <span className={`text-xs font-mono ${lspBuilding ? 'animate-pulse' : ''} ${
                                        namespaceIndex.size > 0 ? 'text-green-400' : 'text-white/60'
                                    }`}>
                                        LSP
                                    </span>
                                </button>

                                {/* Refresh button */}
                                <button
                                    onClick={async () => {
                                        console.log('[Canvas] Refresh clicked')
                                        await reloadGraph()  // Reload nodes/edges from backend
                                        loadCanvas()         // Reload canvas state (positions, selected nodes)
                                        setSearchPanelKey(k => k + 1) // Reset SearchPanel state
                                    }}
                                    disabled={graphLoading}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors disabled:opacity-50"
                                    title="Refresh project and canvas"
                                >
                                    <ArrowPathIcon className={`w-4 h-4 text-white/60 ${graphLoading ? 'animate-spin' : ''}`} />
                                </button>

                                {/* Label display toggle */}
                                <button
                                    onClick={() => setShowLabels(!showLabels)}
                                    className={`p-1.5 rounded transition-colors ${
                                        showLabels ? 'bg-green-500/30 text-green-400' : 'bg-black/60 text-white/40 hover:text-white'
                                    }`}
                                    title={showLabels ? 'Hide Labels' : 'Show Labels'}
                                >
                                    <TagIcon className="w-4 h-4" />
                                </button>

                                {/* Add custom node button */}
                                <button
                                    onClick={() => setShowCustomNodeDialog(true)}
                                    className="p-1.5 bg-black/60 hover:bg-blue-500/30 text-white/60 hover:text-blue-400 rounded transition-colors"
                                    title="Add Custom Node"
                                >
                                    <PlusIcon className="w-4 h-4" />
                                </button>

                                {/* Delete node mode button */}
                                <button
                                    onClick={() => {
                                        setIsRemovingNodes(!isRemovingNodes)
                                        if (!isRemovingNodes) {
                                            // When entering delete mode, cancel add edge mode
                                            setIsAddingEdge(false)
                                        }
                                    }}
                                    className={`p-1.5 rounded transition-colors ${
                                        isRemovingNodes
                                            ? 'bg-red-500/40 text-red-400 ring-1 ring-red-500/50'
                                            : 'bg-black/60 text-white/60 hover:text-red-400 hover:bg-red-500/20'
                                    }`}
                                    title={isRemovingNodes ? 'Exit Remove Mode (click empty area)' : 'Remove Nodes Mode'}
                                >
                                    <TrashIcon className="w-4 h-4" />
                                </button>

                                {/* In-canvas find button - TODO: backend to be developed
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Find clicked - TODO: implement in-canvas search')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Find in Canvas (TODO)"
                                >
                                    <MagnifyingGlassIcon className="w-4 h-4 text-white/60" />
                                </button>
                                */}

                                {/* 光带/流动动画按钮 - TODO: 后端待开发
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Flow animation clicked - TODO: implement edge flow animation')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Flow Animation (TODO)"
                                >
                                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none">
                                        <defs>
                                            <linearGradient id="flowGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                                <stop offset="0%" stopColor="#666" stopOpacity="0.3" />
                                                <stop offset="50%" stopColor="#00d4ff" stopOpacity="1" />
                                                <stop offset="100%" stopColor="#666" stopOpacity="0.3" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M2 10 Q5 6, 10 10 T18 10" stroke="url(#flowGrad)" strokeWidth="2" fill="none" strokeLinecap="round" />
                                    </svg>
                                </button>
                                */}

                                {/* 添加自定义节点按钮 - TODO: 后端待开发
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Add custom node clicked - TODO: implement custom node creation')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-green-500/30 rounded transition-colors"
                                    title="Add Custom Node (TODO)"
                                >
                                    <PlusIcon className="w-4 h-4 text-green-400" />
                                </button>
                                */}

                                {/* 工具设置按钮 - TODO: 后端待开发
                                <button
                                    onClick={() => {
                                        console.log('[Canvas] Tools clicked - TODO: implement tools panel')
                                    }}
                                    className="p-1.5 bg-black/60 hover:bg-white/20 rounded transition-colors"
                                    title="Tools & Settings (TODO)"
                                >
                                    <Cog6ToothIcon className="w-4 h-4 text-white/60" />
                                </button>
                                */}
                            </div>
                        </div>
                    </Panel>

                    {/* Right Panel - Info Panel + Code Viewer (independent toggles) */}
                    {rightPanelVisible && (
                        <>
                            <PanelResizeHandle className="w-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-col-resize flex items-center justify-center group">
                                <div className="h-12 w-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                            </PanelResizeHandle>
                            <Panel defaultSize={25} minSize={15} maxSize={40}>
                                <div className="h-full relative">
                                    {/* Add Edge mode dim overlay */}
                                    {isAddingEdge && (
                                        <div className="absolute inset-0 bg-black/60 z-50 flex items-center justify-center pointer-events-auto">
                                            <div className="text-center text-white/80 px-4">
                                                <div className="text-sm font-medium mb-2">Click a node on canvas</div>
                                                <button
                                                    onClick={() => setIsAddingEdge(false)}
                                                    className="text-xs text-white/50 hover:text-white/70 underline"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                <PanelGroup direction="vertical" className="h-full">
                                    {/* Info Panel */}
                                    {infoPanelOpen && (
                                    <Panel defaultSize={65} minSize={20}>
                                        <div className="h-full bg-black flex flex-col overflow-hidden border-l border-white/10">

                                    {/* Node Panel Content */}
                                    <>
                                    {selectedNode ? (
                                        <div className="flex-1 overflow-y-auto">
                                            {/* Node Header */}
                                            <div className="p-3 border-b border-white/10">
                                                {/* Row 1: Eye + Type + Number + Delete(custom only) */}
                                                <div className="flex items-center gap-2">
                                                    {/* 可见性按钮 - 所有节点统一使用 visibleNodes[] 控制 */}
                                                    <button
                                                        onClick={async () => {
                                                            const isVisible = visibleNodes.includes(selectedNode.id)
                                                            if (isVisible) {
                                                                await graphActions.removeNodeFromCanvas(selectedNode.id)
                                                            } else {
                                                                await graphActions.addNodeToCanvas(selectedNode.id)
                                                            }
                                                        }}
                                                        className={`p-0.5 rounded transition-all flex-shrink-0 ${
                                                            visibleNodes.includes(selectedNode.id)
                                                                ? 'text-green-400 hover:text-green-300 drop-shadow-[0_0_6px_rgba(74,222,128,0.8)]'
                                                                : 'text-gray-500 hover:text-gray-400 animate-pulse-glow'
                                                        }`}
                                                        title={visibleNodes.includes(selectedNode.id) ? 'Remove from canvas' : 'Add to canvas'}
                                                    >
                                                        {visibleNodes.includes(selectedNode.id) ? (
                                                            <EyeIcon className="w-4 h-4" />
                                                        ) : (
                                                            <EyeSlashIcon className="w-4 h-4" />
                                                        )}
                                                    </button>
                                                    {/* Node name with type color - dims when not on canvas */}
                                                    {(() => {
                                                        const isCustomNode = selectedNode.type === 'custom'
                                                        const color = isCustomNode
                                                            ? '#666666'  // 虚构节点用灰色
                                                            : (typeColors[selectedNode.type] || '#888')
                                                        const isOnCanvas = visibleNodes.includes(selectedNode.id)
                                                        return (
                                                            <span
                                                                className={`font-semibold transition-opacity flex-1 truncate ${isOnCanvas ? '' : 'opacity-40'}`}
                                                                style={{ color }}
                                                                title={selectedNode.name}
                                                            >
                                                                {selectedNode.name}
                                                            </span>
                                                        )
                                                    })()}
                                                    {/* Tool buttons - small icons next to name */}
                                                    <div className={`flex gap-0.5 flex-shrink-0 transition-opacity ${
                                                        visibleNodes.includes(selectedNode.id) ? '' : 'opacity-40'
                                                    }`}>
                                                        <button
                                                            onClick={() => handleToggleToolView('style')}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                toolPanelView === 'style'
                                                                    ? 'text-pink-300'
                                                                    : 'text-white/30 hover:text-pink-400'
                                                            }`}
                                                            title="Style"
                                                        >
                                                            <SwatchIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleToolView('edges')}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                toolPanelView === 'edges'
                                                                    ? 'text-blue-300'
                                                                    : 'text-white/30 hover:text-blue-400'
                                                            }`}
                                                            title="Edges"
                                                        >
                                                            <ArrowLongRightIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={() => handleToggleToolView('neighbors')}
                                                            className={`p-0.5 rounded transition-colors ${
                                                                toolPanelView === 'neighbors'
                                                                    ? 'text-purple-300'
                                                                    : 'text-white/30 hover:text-purple-400'
                                                            }`}
                                                            title="Neighbors"
                                                        >
                                                            <ArrowsPointingOutIcon className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                    {/* Delete button - 统一处理所有节点类型 */}
                                                    {(visibleNodes.includes(selectedNode.id) || selectedNode.type === 'custom') && (
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm('Delete this node? This will remove it from canvas and clear its meta info.')) {
                                                                    const isCustom = selectedNode.type === 'custom'
                                                                    const customData = isCustom ? customNodes.find(n => n.id === selectedNode.id) : undefined
                                                                    await graphActions.deleteNodeWithMeta(
                                                                        selectedNode.id,
                                                                        selectedNode.name,
                                                                        isCustom,
                                                                        customData
                                                                    )
                                                                    setSelectedNode(null)
                                                                }
                                                            }}
                                                            className="p-0.5 rounded transition-all flex-shrink-0 text-red-400 hover:text-red-300"
                                                            title="Delete node"
                                                        >
                                                            <XMarkIcon className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Custom Node Name - editable for custom nodes only */}
                                                {selectedNode.type === 'custom' && (
                                                    <div className="mt-2">
                                                        {isEditingCustomNodeName ? (
                                                            <input
                                                                ref={customNodeNameInputRef}
                                                                type="text"
                                                                value={editingCustomNodeNameValue}
                                                                onChange={(e) => setEditingCustomNodeNameValue(e.target.value)}
                                                                onBlur={saveCustomNodeName}
                                                                onKeyDown={(e) => {
                                                                    if (e.key === 'Enter') saveCustomNodeName()
                                                                    if (e.key === 'Escape') setIsEditingCustomNodeName(false)
                                                                }}
                                                                className="w-full bg-black/30 border border-white/20 rounded px-2 py-1 text-sm text-white font-mono focus:border-cyan-500/50 focus:outline-none"
                                                                autoFocus
                                                            />
                                                        ) : (
                                                            <div
                                                                onClick={() => {
                                                                    setEditingCustomNodeNameValue(selectedNode.name)
                                                                    setIsEditingCustomNodeName(true)
                                                                }}
                                                                className="text-sm text-white/80 font-mono cursor-pointer hover:text-cyan-400 transition-colors px-2 py-1 rounded hover:bg-white/5"
                                                                title="Click to edit name"
                                                            >
                                                                {selectedNode.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Notes section - always visible */}
                                                {editingNote && (
                                                    <div className="mt-3 pt-3 border-t border-white/5">
                                                        <div
                                                            onClick={() => setNotesExpanded(!notesExpanded)}
                                                            className={`cursor-pointer ${notesExpanded ? 'overflow-y-auto' : 'max-h-24 overflow-hidden'}`}
                                                            style={notesExpanded ? { maxHeight: `calc(100vh - ${codeViewerOpen ? '400px' : '300px'})` } : {
                                                                maskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                                                WebkitMaskImage: 'linear-gradient(to bottom, black 60%, transparent 100%)',
                                                            }}
                                                        >
                                                            <MarkdownRenderer content={editingNote} />
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tool panel expand area */}
                                                {toolPanelView && toolPanelView !== 'notes' && (
                                                    <div className="mt-2 p-2 bg-black/20 rounded-md">
                                                        {toolPanelView === 'edges' && (
                                                            <div className="space-y-2">
                                                                {/* Add Edge button / Adding mode indicator */}
                                                                {isAddingEdge ? (
                                                                    <div className="p-1.5 bg-green-500/20 border border-green-500/30 rounded text-xs flex items-center justify-between">
                                                                        <span className="text-green-400">Click node to connect</span>
                                                                        <button onClick={cancelAddingEdge} className="text-white/50 hover:text-white">
                                                                            <XMarkIcon className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        onClick={() => {
                                                                            setAddingEdgeDirection('outgoing')
                                                                            setIsAddingEdge(true)
                                                                            setIsRemovingNodes(false)
                                                                        }}
                                                                        className="w-full py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs rounded transition-colors flex items-center justify-center gap-1"
                                                                    >
                                                                        <PlusIcon className="w-3.5 h-3.5" />
                                                                        <span>Add Edge</span>
                                                                    </button>
                                                                )}

                                                                {/* Unified Edges List */}
                                                                {(() => {
                                                                    // Collect all incoming edges (depends on)
                                                                    const customIncoming = customEdges.filter(e => e.target === selectedNode.id)
                                                                    const provenIncoming = graphLinks.filter(l => l.target === selectedNode.id)
                                                                    // Collect all outgoing edges (used by)
                                                                    const customOutgoing = customEdges.filter(e => e.source === selectedNode.id)
                                                                    const provenOutgoing = graphLinks.filter(l => l.source === selectedNode.id)

                                                                    const totalIncoming = customIncoming.length + provenIncoming.length
                                                                    const totalOutgoing = customOutgoing.length + provenOutgoing.length

                                                                    const renderEdgeItem = (edge: any, isCustom: boolean, direction: 'in' | 'out') => {
                                                                        const nodeId = direction === 'in' ? edge.source : edge.target
                                                                        const node = graphNodes.find(n => n.id === nodeId) || customNodes.find(cn => cn.id === nodeId)
                                                                        const nodeName = node?.name || nodeId
                                                                        const nodeKind = node ? ('kind' in node ? node.kind : ('type' in node ? node.type : undefined)) : undefined
                                                                        const nodeColor = node ? (nodeKind === 'custom' ? '#666' : (nodeKind ? typeColors[nodeKind] || '#888' : '#888')) : '#888'
                                                                        const isOnCanvas = node ? visibleNodes.includes(node.id) : false
                                                                        const edgeId = isCustom ? edge.id : `${edge.source}->${edge.target}`
                                                                        const isEdgeSelected = selectedEdge?.id === edgeId
                                                                        // Check if this is a shortcut/virtual edge
                                                                        const edgeData = isCustom ? edge : astrolabeEdges.find(e => e.id === edgeId || e.id === `virtual-${edgeId}`)
                                                                        const isShortcut = edgeData?.skippedNodes && edgeData.skippedNodes.length > 0

                                                                        return (
                                                                            <div
                                                                                key={edgeId}
                                                                                onClick={() => {
                                                                                    if (isEdgeSelected) {
                                                                                        setSelectedEdge(null)
                                                                                        setFocusEdgeId(null)
                                                                                    } else {
                                                                                        setSelectedEdge({
                                                                                            id: edgeData?.id || edgeId,
                                                                                            source: edge.source,
                                                                                            target: edge.target,
                                                                                            sourceName: direction === 'in' ? nodeName : selectedNode.name,
                                                                                            targetName: direction === 'in' ? selectedNode.name : nodeName,
                                                                                            style: edgeData?.style,
                                                                                            effect: edgeData?.effect,
                                                                                            defaultStyle: isCustom ? 'dashed' : (edgeData?.defaultStyle ?? 'solid'),
                                                                                            skippedNodes: edgeData?.skippedNodes,
                                                                                        })
                                                                                        setFocusEdgeId(edgeData?.id || edgeId)
                                                                                        // Set code location to the other end node
                                                                                        const otherNode = graphNodes.find(n => n.id === nodeId)
                                                                                        if (otherNode?.leanFilePath && otherNode?.leanLineNumber) {
                                                                                            setCodeLocation({
                                                                                                filePath: otherNode.leanFilePath,
                                                                                                lineNumber: otherNode.leanLineNumber,
                                                                                            })
                                                                                            setCodeViewerOpen(true)
                                                                                        }
                                                                                    }
                                                                                }}
                                                                                className={`px-1.5 py-1 rounded text-[11px] flex items-center gap-1.5 cursor-pointer transition-colors ${
                                                                                    isEdgeSelected
                                                                                        ? 'bg-cyan-500/30 ring-1 ring-cyan-500/50'
                                                                                        : isShortcut
                                                                                            ? 'bg-cyan-500/10 hover:bg-cyan-500/20 ring-1 ring-cyan-500/20'
                                                                                            : 'bg-white/5 hover:bg-white/10'
                                                                                }`}
                                                                            >
                                                                                {/* Shortcut indicator */}
                                                                                {isShortcut && <span className="text-cyan-400 text-[9px] flex-shrink-0" title={`Shortcut: skips ${edgeData?.skippedNodes?.length} technical node(s)`}>⚡</span>}
                                                                                {/* Custom indicator */}
                                                                                {isCustom && !isShortcut && <span className="w-2 h-0 border-t border-dashed border-gray-400 flex-shrink-0" title="Custom edge" />}
                                                                                {/* Node name */}
                                                                                <span
                                                                                    className={`font-mono flex-1 truncate ${isOnCanvas ? '' : 'opacity-50'}`}
                                                                                    style={{ color: nodeColor }}
                                                                                >
                                                                                    {nodeName.split('.').pop()}
                                                                                </span>
                                                                                {/* Goto button */}
                                                                                {node && (
                                                                                    <button
                                                                                        onClick={(e) => { e.stopPropagation(); navigateToNode(nodeId) }}
                                                                                        className="text-[9px] text-white/40 hover:text-cyan-300 transition-colors"
                                                                                    >
                                                                                        →
                                                                                    </button>
                                                                                )}
                                                                                {/* Delete button for custom edges */}
                                                                                {isCustom && (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation()
                                                                                            const leanEdges = astrolabeEdges.map(e => ({ source: e.source, target: e.target }))
                                                                                            graphActions.deleteCustomEdge(edge.id, edge.source, edge.target, leanEdges)
                                                                                        }}
                                                                                        className="text-red-400/40 hover:text-red-400 transition-colors"
                                                                                    >
                                                                                        <XMarkIcon className="w-3 h-3" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        )
                                                                    }

                                                                    return (
                                                                        <div className="space-y-2">
                                                                            {/* Depends on */}
                                                                            <div>
                                                                                <div className="text-[10px] text-cyan-400/70 mb-1 flex items-center gap-1">
                                                                                    <ArrowLongRightIcon className="w-3 h-3 rotate-180" />
                                                                                    <span>Depends on ({totalIncoming})</span>
                                                                                </div>
                                                                                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                                                    {totalIncoming === 0 ? (
                                                                                        <span className="text-[10px] text-white/30 pl-1">None</span>
                                                                                    ) : (
                                                                                        <>
                                                                                            {customIncoming.map(e => renderEdgeItem(e, true, 'in'))}
                                                                                            {provenIncoming.map(e => renderEdgeItem(e, false, 'in'))}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                            {/* Used by */}
                                                                            <div>
                                                                                <div className="text-[10px] text-orange-400/70 mb-1 flex items-center gap-1">
                                                                                    <ArrowLongRightIcon className="w-3 h-3" />
                                                                                    <span>Used by ({totalOutgoing})</span>
                                                                                </div>
                                                                                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                                                                                    {totalOutgoing === 0 ? (
                                                                                        <span className="text-[10px] text-white/30 pl-1">None</span>
                                                                                    ) : (
                                                                                        <>
                                                                                            {customOutgoing.map(e => renderEdgeItem(e, true, 'out'))}
                                                                                            {provenOutgoing.map(e => renderEdgeItem(e, false, 'out'))}
                                                                                        </>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )
                                                                })()}

                                                                {/* Edge Style Panel */}
                                                                {selectedEdge && (
                                                                    <div className="pt-2 border-t border-white/10">
                                                                        {/* Shortcut Edge Info */}
                                                                        {selectedEdge.skippedNodes && selectedEdge.skippedNodes.length > 0 && (
                                                                            <div className="mb-3 p-2 bg-cyan-500/10 border border-cyan-500/30 rounded">
                                                                                <div className="flex items-center gap-2 mb-1">
                                                                                    <span className="text-cyan-400 text-xs font-medium">⚡ Shortcut Edge</span>
                                                                                    <span className="text-white/40 text-xs">
                                                                                        ({selectedEdge.skippedNodes.length} hidden)
                                                                                    </span>
                                                                                </div>
                                                                                <div className="flex flex-wrap gap-1">
                                                                                    {selectedEdge.skippedNodes.map(nodeId => {
                                                                                        const node = graphNodes.find(n => n.id === nodeId)
                                                                                        const displayName = node?.name?.split('.').pop() || nodeId.split('.').pop() || nodeId
                                                                                        return (
                                                                                            <span
                                                                                                key={nodeId}
                                                                                                className="px-1.5 py-0.5 bg-white/5 text-white/60 text-[10px] rounded truncate max-w-[100px]"
                                                                                                title={node?.name || nodeId}
                                                                                            >
                                                                                                {displayName}
                                                                                            </span>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                        <EdgeStylePanel
                                                                            edgeId={selectedEdge.id}
                                                                            sourceNode={selectedEdge.sourceName}
                                                                            targetNode={selectedEdge.targetName}
                                                                            initialStyle={selectedEdge.style ?? selectedEdge.defaultStyle}
                                                                            initialEffect={selectedEdge.effect}
                                                                            defaultStyle={selectedEdge.defaultStyle}
                                                                            onStyleChange={handleEdgeStyleChange}
                                                                            compact
                                                                        />
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}

                                                        {toolPanelView === 'style' && (
                                                            <NodeStylePanel
                                                                nodeId={selectedNode.id}
                                                                initialSize={selectedNode.customSize ?? 1.0}
                                                                initialEffect={selectedNode.customEffect}
                                                                onStyleChange={handleStyleChange}
                                                                compact
                                                            />
                                                        )}

                                                        {toolPanelView === 'neighbors' && (() => {
                                                            // Collect all connected nodes with relationship info
                                                            const customIncoming = customEdges.filter(e => e.target === selectedNode.id)
                                                            const customOutgoing = customEdges.filter(e => e.source === selectedNode.id)
                                                            const provenIncoming = graphLinks.filter(l => l.target === selectedNode.id)
                                                            const provenOutgoing = graphLinks.filter(l => l.source === selectedNode.id)

                                                            // Build neighbor list with relationship type
                                                            const customNodeIds = new Set(customNodes.map(n => n.id))
                                                            const neighborMap = new Map<string, { id: string; name: string; kind: string; relation: 'depends' | 'usedBy'; isCustom: boolean; isOnCanvas: boolean }>()

                                                            // Depends on (incoming edges = this node depends on source)
                                                            provenIncoming.forEach(e => {
                                                                const node = graphNodes.find(n => n.id === e.source)
                                                                neighborMap.set(e.source, {
                                                                    id: e.source,
                                                                    name: node?.name || e.source,
                                                                    kind: node?.type || 'unknown',
                                                                    relation: 'depends',
                                                                    isCustom: false,
                                                                    isOnCanvas: visibleNodes.includes(e.source)
                                                                })
                                                            })
                                                            customIncoming.forEach(e => {
                                                                const isCustomNode = customNodeIds.has(e.source)
                                                                const customNode = customNodes.find(n => n.id === e.source)
                                                                const node = graphNodes.find(n => n.id === e.source)
                                                                neighborMap.set(e.source, {
                                                                    id: e.source,
                                                                    name: customNode?.name || node?.name || e.source,
                                                                    kind: isCustomNode ? 'custom' : (node?.type || 'unknown'),
                                                                    relation: 'depends',
                                                                    isCustom: true,
                                                                    isOnCanvas: visibleNodes.includes(e.source)
                                                                })
                                                            })

                                                            // Used by (outgoing edges = target uses this node)
                                                            provenOutgoing.forEach(e => {
                                                                const node = graphNodes.find(n => n.id === e.target)
                                                                neighborMap.set(e.target, {
                                                                    id: e.target,
                                                                    name: node?.name || e.target,
                                                                    kind: node?.type || 'unknown',
                                                                    relation: 'usedBy',
                                                                    isCustom: false,
                                                                    isOnCanvas: visibleNodes.includes(e.target)
                                                                })
                                                            })
                                                            customOutgoing.forEach(e => {
                                                                const isCustomNode = customNodeIds.has(e.target)
                                                                const customNode = customNodes.find(n => n.id === e.target)
                                                                const node = graphNodes.find(n => n.id === e.target)
                                                                neighborMap.set(e.target, {
                                                                    id: e.target,
                                                                    name: customNode?.name || node?.name || e.target,
                                                                    kind: isCustomNode ? 'custom' : (node?.type || 'unknown'),
                                                                    relation: 'usedBy',
                                                                    isCustom: true,
                                                                    isOnCanvas: visibleNodes.includes(e.target)
                                                                })
                                                            })

                                                            const neighborsList = Array.from(neighborMap.values())
                                                            // closedNeighbors: 不在画布上的邻居节点（统一使用 visibleNodes 判断）
                                                            const closedNeighbors = neighborsList.filter(n => !n.isOnCanvas)
                                                            const allOpen = closedNeighbors.length === 0

                                                            if (neighborsList.length === 0) {
                                                                return (
                                                                    <div className="text-xs text-white/40 text-center py-4">
                                                                        No neighbors found
                                                                    </div>
                                                                )
                                                            }

                                                            return (
                                                                <div className="space-y-2">
                                                                    {/* Node list - click to toggle */}
                                                                    <div className="max-h-60 overflow-y-auto space-y-0.5">
                                                                        {neighborsList.map(node => {
                                                                            const isCustomNode = customNodeIds.has(node.id)
                                                                            return (
                                                                                <div
                                                                                    key={node.id}
                                                                                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors hover:bg-white/10 ${node.isOnCanvas ? '' : 'opacity-40'}`}
                                                                                >
                                                                                    {/* Toggle visibility button (not for custom nodes) */}
                                                                                    {!isCustomNode ? (
                                                                                        <button
                                                                                            onClick={async () => {
                                                                                                if (node.isOnCanvas) {
                                                                                                    await graphActions.removeNodeFromCanvas(node.id)
                                                                                                } else {
                                                                                                    await graphActions.addNodeToCanvas(node.id)
                                                                                                }
                                                                                            }}
                                                                                            className={`w-4 h-4 flex items-center justify-center rounded transition-colors ${
                                                                                                node.isOnCanvas
                                                                                                    ? 'text-green-400/60 hover:text-red-400'
                                                                                                    : 'text-white/30 hover:text-green-400'
                                                                                            }`}
                                                                                            title={node.isOnCanvas ? 'Remove from canvas' : 'Add to canvas'}
                                                                                        >
                                                                                            {node.isOnCanvas ? (
                                                                                                <EyeIcon className="w-3.5 h-3.5" />
                                                                                            ) : (
                                                                                                <EyeSlashIcon className="w-3.5 h-3.5" />
                                                                                            )}
                                                                                        </button>
                                                                                    ) : (
                                                                                        <div className="w-4" />
                                                                                    )}
                                                                                    {/* Relation indicator */}
                                                                                    <span className={`text-[9px] w-8 ${
                                                                                        node.relation === 'depends' ? 'text-cyan-400/60' : 'text-orange-400/60'
                                                                                    }`}>
                                                                                        {node.relation === 'depends' ? 'dep' : 'used'}
                                                                                    </span>
                                                                                    {/* Node name - clickable to navigate */}
                                                                                    <button
                                                                                        onClick={() => navigateToNode(node.id)}
                                                                                        className="text-xs truncate flex-1 text-left hover:underline"
                                                                                        style={{ color: node.kind === 'custom' ? '#888' : (typeColors[node.kind] || '#888') }}
                                                                                        title="Go to node"
                                                                                    >
                                                                                        {node.name}
                                                                                    </button>
                                                                                    {/* Custom badge */}
                                                                                    {node.isCustom && (
                                                                                        <span className="text-[8px] px-1 py-0.5 bg-gray-500/30 text-gray-400 rounded">
                                                                                            custom
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                            )
                                                                        })}
                                                                    </div>

                                                                    {/* Toggle All button */}
                                                                    {(closedNeighbors.length > 0 || neighborsList.some(n => n.isOnCanvas && !customNodeIds.has(n.id))) && (
                                                                        <button
                                                                            onClick={async () => {
                                                                                if (allOpen) {
                                                                                    // Close all (except custom nodes)
                                                                                    for (const node of neighborsList) {
                                                                                        if (node.isOnCanvas && !customNodeIds.has(node.id)) {
                                                                                            await graphActions.removeNodeFromCanvas(node.id)
                                                                                        }
                                                                                    }
                                                                                } else {
                                                                                    // Open all closed
                                                                                    await graphActions.addNodesToCanvas(closedNeighbors.map(n => n.id))
                                                                                }
                                                                            }}
                                                                            className={`w-full py-1.5 text-xs rounded transition-colors ${
                                                                                allOpen
                                                                                    ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400'
                                                                                    : 'bg-green-500/20 hover:bg-green-500/30 text-green-400'
                                                                            }`}
                                                                        >
                                                                            {allOpen ? 'Close All' : 'Open All'}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            )
                                                        })()}

                                                    </div>
                                                )}
                                            </div>

                                        </div>
                                    ) : (
                                        /* Empty state when no node is selected */
                                        <div className="flex flex-col items-center justify-center flex-1 text-white/40 p-4">
                                            <CubeIcon className="w-12 h-12 mb-3 opacity-50" />
                                                <p className="text-sm text-center">Select a node to view details</p>
                                                <p className="text-xs text-center mt-1 text-white/30">Click on any node in the graph</p>
                                            </div>
                                        )}
                                    </>
                                        </div>
                                    </Panel>
                                    )}

                                    {/* Resize handle between panels (only if both are open) */}
                                    {infoPanelOpen && codeViewerOpen && (
                                        <PanelResizeHandle className="h-2 bg-white/10 hover:bg-blue-500/50 transition-colors cursor-row-resize flex items-center justify-center group">
                                            <div className="w-12 h-1 bg-white/20 group-hover:bg-white/40 rounded-full" />
                                        </PanelResizeHandle>
                                    )}

                                    {/* Code Viewer Panel - 由 Lean 按钮触发 */}
                                    {codeViewerOpen && (
                                        <Panel defaultSize={35} minSize={20}>
                                            <div className="h-full flex flex-col bg-[#0d1117] border-l border-white/10">
                                                {/* Tab buttons */}
                                                <div className="flex border-b border-white/10 px-2 pt-2 gap-1">
                                                    <button
                                                        onClick={() => setCodeViewMode('code')}
                                                        className={`px-3 py-1.5 text-xs rounded-t transition-colors flex items-center gap-1 ${
                                                            codeViewMode === 'code'
                                                                ? 'bg-cyan-500/20 text-cyan-400 border-b-2 border-cyan-400'
                                                                : 'text-white/50 hover:text-white/80'
                                                        }`}
                                                    >
                                                        L∃∀N
                                                        {codeDirty && <span className="text-yellow-400" title="Unsaved changes (Ctrl+S to save)">●</span>}
                                                    </button>
                                                    <button
                                                        onClick={() => setCodeViewMode('notes')}
                                                        className={`px-3 py-1.5 text-xs rounded-t transition-colors ${
                                                            codeViewMode === 'notes'
                                                                ? 'bg-yellow-500/20 text-yellow-400 border-b-2 border-yellow-400'
                                                                : 'text-white/50 hover:text-white/80'
                                                        }`}
                                                        title="Edit Notes"
                                                    >
                                                        Notes
                                                    </button>
                                                    <div className="flex-1" />
                                                    <button
                                                        onClick={() => setCodeViewerOpen(false)}
                                                        className="px-2 py-1 text-white/40 hover:text-white/80 text-xs"
                                                        title="Close"
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {/* Content area */}
                                                <div className="flex-1 overflow-auto relative">
                                                    {/* Code panel - keep mounted, hide with CSS to avoid Monaco "Canceled" errors */}
                                                    <div className={`h-full ${codeViewMode === 'code' ? '' : 'hidden'}`}>
                                                        {codeLoading && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                                                                <div className="text-white/40 text-sm">Loading...</div>
                                                            </div>
                                                        )}
                                                        {codeFile ? (
                                                            <LeanCodePanel
                                                                key={`${codeLocation?.filePath || selectedNode?.leanFilePath || 'editor'}-${codeLocation?.lineNumber || 0}-${nodeClickCount}`}
                                                                content={codeFile.content}
                                                                filePath={codeLocation?.filePath || selectedNode?.leanFilePath}
                                                                lineNumber={codeLocation?.lineNumber || selectedNode?.leanLineNumber}
                                                                startLine={codeFile.startLine}
                                                                endLine={codeFile.endLine}
                                                                totalLines={codeFile.totalLines}
                                                                nodeName={selectedNode?.name}
                                                                nodeKind={selectedNode?.id.startsWith('group:') ? 'namespace' : selectedNode?.type}
                                                                onClose={() => setCodeViewerOpen(false)}
                                                                hideHeader
                                                                readOnly
                                                                nodeStatusLines={nodeStatusLines}
                                                            />
                                                        ) : !codeLoading && (
                                                            <div className="h-full flex items-center justify-center">
                                                                <div className="text-white/40 text-sm">No content</div>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Notes panel */}
                                                    <div className={`h-full flex flex-col ${codeViewMode === 'notes' ? '' : 'hidden'}`}>
                                                        <textarea
                                                            value={editingNote}
                                                            onChange={(e) => handleNoteChange(e.target.value)}
                                                            placeholder="# Notes&#10;&#10;Write your notes in **Markdown** format...&#10;&#10;- Supports lists&#10;- Code blocks&#10;- Math: $E = mc^2$&#10;&#10;Auto-saves as you type."
                                                            className="flex-1 w-full bg-transparent text-white/90 text-xs font-mono p-3 resize-none focus:outline-none placeholder-white/30 leading-relaxed"
                                                            spellCheck={false}
                                                        />
                                                        <div className="px-3 py-1.5 border-t border-white/10 text-[10px] text-white/30">
                                                            Markdown supported. Auto-saves as you type.
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </Panel>
                                    )}
                                </PanelGroup>
                                </div>
                            </Panel>
                        </>
                    )}
                </PanelGroup>
            </div>

            {/* Status Bar */}
            <div className="h-6 border-t border-white/10 bg-black flex items-center justify-between px-2 text-xs text-white/70 shrink-0">
                <div className="flex items-center gap-3">
                    {/* Project name */}
                    <span className="text-white/60">{projectName}</span>
                </div>

                <div className="flex items-center gap-3 text-white/60">
                    {/* Current File */}
                    {selectedNode?.leanFilePath && (
                        <span className="truncate max-w-[300px] flex items-center gap-1" title={selectedNode.leanFilePath}>
                            {selectedNode.leanFilePath.split('/').pop()}
                            {codeDirty && <span className="text-white/80" title="Unsaved changes (Ctrl+S to save)">●</span>}
                        </span>
                    )}
                </div>
            </div>

            {/* 创建虚构节点对话框 */}
            {showCustomNodeDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => {
                            setShowCustomNodeDialog(false)
                            setCustomNodeName('')
                        }}
                    />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-white/10 shadow-2xl">
                        <h3 className="text-lg font-semibold text-white mb-4">Add Custom Node</h3>
                        <p className="text-sm text-white/60 mb-4">
                            Custom nodes are displayed in gray and represent planned theorems or conjectures.
                        </p>
                        <input
                            type="text"
                            value={customNodeName}
                            onChange={(e) => setCustomNodeName(e.target.value)}
                            placeholder="Enter node name..."
                            className="w-full px-3 py-2 bg-black/50 border border-white/20 rounded text-white text-sm placeholder-white/40 focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleCreateCustomNode()
                                } else if (e.key === 'Escape') {
                                    setShowCustomNodeDialog(false)
                                    setCustomNodeName('')
                                }
                            }}
                        />
                        <div className="flex justify-end gap-2 mt-4">
                            <button
                                onClick={() => {
                                    setShowCustomNodeDialog(false)
                                    setCustomNodeName('')
                                }}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateCustomNode}
                                disabled={!customNodeName.trim()}
                                className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/30 text-white rounded transition-colors"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reset All Data Confirmation Dialog */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setShowResetConfirm(false)}
                    />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-red-500/30 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white">Reset All Data</h3>
                        </div>
                        <p className="text-sm text-white/60 mb-2">
                            This will permanently delete:
                        </p>
                        <ul className="text-sm text-red-400 mb-4 list-disc list-inside space-y-1">
                            <li>All custom nodes</li>
                            <li>All custom edges</li>
                            <li>All node metadata (colors, labels, notes)</li>
                        </ul>
                        <p className="text-sm text-white/40 mb-4">
                            This action cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={confirmResetAllData}
                                className="px-4 py-2 text-sm bg-red-500 hover:bg-red-600 text-white rounded transition-colors"
                            >
                                Reset All Data
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Reload Prompt after Reset */}
            {showReloadPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div className="absolute inset-0 bg-black/70" />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-96 border border-green-500/30 shadow-2xl">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center">
                                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h3 className="text-lg font-semibold text-white">Reset Complete</h3>
                        </div>
                        <p className="text-sm text-white/60 mb-4">
                            All data has been cleared. Click &quot;Reload&quot; to re-parse the project from Lean files and regenerate the graph.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowReloadPrompt(false)}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Later
                            </button>
                            <button
                                onClick={() => window.location.reload()}
                                className="px-4 py-2 text-sm bg-green-500 hover:bg-green-600 text-white rounded transition-colors"
                            >
                                Reload Now
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Clear Canvas Dialog */}
            {showClearCanvasDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    {/* 背景遮罩 */}
                    <div
                        className="absolute inset-0 bg-black/70"
                        onClick={() => setShowClearCanvasDialog(false)}
                    />
                    {/* 对话框 */}
                    <div className="relative bg-gray-900 rounded-lg p-6 w-[480px] max-h-[80vh] border border-white/10 shadow-2xl flex flex-col">
                        <h3 className="text-lg font-semibold text-white mb-4">Clear Canvas</h3>

                        {canvasNodes.length === 0 ? (
                            <p className="text-sm text-white/60 mb-4">No nodes on canvas.</p>
                        ) : (
                            <>
                                {/* 操作按钮 */}
                                <div className="flex gap-2 mb-3">
                                    <button
                                        onClick={selectAllNodesToRemove}
                                        className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                    >
                                        Select All
                                    </button>
                                    <button
                                        onClick={deselectAllNodesToRemove}
                                        className="px-3 py-1 text-xs bg-white/10 hover:bg-white/20 text-white/80 rounded transition-colors"
                                    >
                                        Deselect All
                                    </button>
                                    <span className="text-xs text-white/40 ml-auto self-center">
                                        {selectedNodesToRemove.size} / {canvasNodes.length} selected
                                    </span>
                                </div>

                                {/* 节点列表 */}
                                <div className="flex-1 overflow-y-auto max-h-[300px] border border-white/10 rounded mb-4">
                                    {canvasNodes.map(node => (
                                        <div
                                            key={node.id}
                                            onClick={() => toggleNodeToRemove(node.id)}
                                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                                                selectedNodesToRemove.has(node.id)
                                                    ? 'bg-blue-500/20'
                                                    : 'hover:bg-white/5'
                                            }`}
                                        >
                                            {/* Checkbox */}
                                            <div className={`w-4 h-4 rounded border ${
                                                selectedNodesToRemove.has(node.id)
                                                    ? 'bg-blue-500 border-blue-500'
                                                    : 'border-white/30'
                                            } flex items-center justify-center`}>
                                                {selectedNodesToRemove.has(node.id) && (
                                                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            {/* 节点信息 */}
                                            <div className="flex-1 min-w-0">
                                                <div
                                                    className="text-sm truncate"
                                                    style={{ color: node.defaultColor }}
                                                >
                                                    {node.name}
                                                </div>
                                                <div className="text-xs text-white/40">{node.kind}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}

                        {/* 底部按钮 */}
                        <div className="flex justify-between gap-2">
                            <button
                                onClick={() => setShowClearCanvasDialog(false)}
                                className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors"
                            >
                                Cancel
                            </button>
                            <div className="flex gap-2">
                                <button
                                    onClick={removeSelectedNodes}
                                    disabled={selectedNodesToRemove.size === 0}
                                    className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 disabled:bg-blue-500/30 disabled:text-white/30 text-white rounded transition-colors"
                                >
                                    Remove Selected ({selectedNodesToRemove.size})
                                </button>
                                <button
                                    onClick={clearAllNodes}
                                    disabled={canvasNodes.length === 0}
                                    className="px-4 py-2 text-sm bg-red-500/80 hover:bg-red-500 disabled:bg-red-500/30 disabled:text-white/30 text-white rounded transition-colors"
                                >
                                    Clear All
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Lens Picker (Cmd+K) */}
            <LensPicker
                isOpen={isLensPickerOpen}
                onClose={closeLensPicker}
                nodeCount={canvasNodes.length}
            />

            {/* LSP Status Bar - bottom */}
            {lspStatus && (
                <div className="fixed bottom-0 left-0 right-0 z-50 bg-black/90 border-t border-white/10 px-4 py-2">
                    <div className="flex items-center gap-2 text-xs text-white/70">
                        {lspBuilding && (
                            <div className="w-3 h-3 border-2 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
                        )}
                        <span className={lspBuilding ? 'animate-pulse' : ''}>{lspStatus}</span>
                    </div>
                </div>
            )}
        </div>
    )
}

export default function LocalEditPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-black flex items-center justify-center">
                <div className="text-white/60">Loading...</div>
            </div>
        }>
            <LocalEditorContent />
        </Suspense>
    )
}

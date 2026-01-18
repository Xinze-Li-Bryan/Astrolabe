'use client'

/**
 * SearchPanel - Node search panel
 *
 * Search theorems/lemmas in the project, click to select node displayed in right panel
 * Supports four browse modes: A-Z, Popular, Links, Depth
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useCanvasStore, SearchResult, CustomNode } from '@/lib/canvasStore'
import { KIND_COLORS } from '@/lib/store'

// Type label mapping
const TYPE_LABELS: Record<string, string> = {
  theorem: 'Theorem',
  lemma: 'Lemma',
  definition: 'Definition',
  def: 'Definition',
  structure: 'Structure',
  class: 'Class',
  instance: 'Instance',
  axiom: 'Axiom',
  example: 'Example',
  inductive: 'Inductive',
  custom: 'Custom',
}

// Browse mode type
type BrowseMode = 'type' | 'az' | 'popular' | 'links' | 'depth'

// Icons for group headers
const Icons = {
  fire: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 23c-3.314 0-6-2.686-6-6 0-1.657.673-3.158 1.757-4.243L12 8.5l4.243 4.257A5.978 5.978 0 0118 17c0 3.314-2.686 6-6 6zm0-4a2 2 0 100-4 2 2 0 000 4z"/>
    </svg>
  ),
  star: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  pin: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 4V2H8v2H2v2h2v8l-2 2v2h7v4h2v-4h7v-2l-2-2V6h2V4h-6zm-2 10H10V6h4v8z"/>
    </svg>
  ),
  sleep: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54s-2.94 8.27-7 9.54c.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z"/>
    </svg>
  ),
  link: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
    </svg>
  ),
  layers: (
    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  ),
}

// Group data structure
interface Group {
  key: string
  label: string
  icon?: React.ReactNode
  color?: string  // Used to display type color in Type mode
  kind?: string   // Used to identify type in Type mode
  items: SearchResult[]
}

interface SearchPanelProps {
  className?: string
  selectedNodeId?: string | null
  onNodeSelect?: (result: SearchResult) => void
}

export function SearchPanel({ className = '', selectedNodeId, onNodeSelect }: SearchPanelProps) {
  const {
    searchQuery,
    searchResults,
    isSearching,
    visibleNodes,
    customNodes,
    search,
    setSearchQuery,
  } = useCanvasStore()

  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [browseMode, setBrowseMode] = useState<BrowseMode>('type')

  // Convert customNodes to SearchResult format and merge with searchResults
  const allResults = useMemo((): SearchResult[] => {
    // Convert customNodes to SearchResult format
    const customResults: SearchResult[] = customNodes
      .filter(node => {
        // If there's a search query, filter matching custom nodes
        if (!localQuery.trim()) return true
        const query = localQuery.toLowerCase()
        return node.name.toLowerCase().includes(query) || node.id.toLowerCase().includes(query)
      })
      .map(node => ({
        id: node.id,
        name: node.name,
        kind: 'custom',
        filePath: '',
        lineNumber: 0,
        status: '',
        dependsOnCount: 0,
        usedByCount: 0,
        depth: 0,
      }))

    // Merge the two lists
    return [...searchResults, ...customResults]
  }, [searchResults, customNodes, localQuery])

  // All groups collapsed by default
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string> | 'all'>('all')

  // Reset to all collapsed when switching browse mode
  const handleBrowseModeChange = useCallback((mode: BrowseMode) => {
    setBrowseMode(mode)
    setCollapsedGroups('all')
  }, [])

  // Refs for scrolling to selected node
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map())

  // Load all nodes on initialization
  useEffect(() => {
    search('')
  }, [search])

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      search(localQuery)
    }, 300)

    return () => clearTimeout(timer)
  }, [localQuery, search])

  const handleNodeClick = useCallback((result: SearchResult) => {
    onNodeSelect?.(result)
  }, [onNodeSelect])

  const isNodeVisible = useCallback((id: string) => {
    // Check if in visibleNodes or customNodes
    return visibleNodes.includes(id) || customNodes.some(n => n.id === id)
  }, [visibleNodes, customNodes])

  const toggleGroup = useCallback((key: string, allGroups: Group[]) => {
    setCollapsedGroups(prev => {
      // If 'all', clicking a group expands it (others stay collapsed)
      if (prev === 'all') {
        // Create a Set containing all groups, then remove the clicked group
        const allKeys = new Set(allGroups.map(g => g.key))
        allKeys.delete(key)
        return allKeys
      }
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }, [])

  // Calculate each node's index within its type (based on all search results)
  const kindIndices = useMemo(() => {
    const indices: Record<string, number> = {}
    const kindCounters: Record<string, number> = {}

    // Count by kind grouping
    for (const result of allResults) {
      const kind = result.kind
      if (!kindCounters[kind]) {
        kindCounters[kind] = 0
      }
      kindCounters[kind]++
      indices[result.id] = kindCounters[kind]
    }

    return indices
  }, [allResults])

  // Group results based on browse mode
  const groupedResults = useMemo((): Group[] => {
    if (allResults.length === 0) return []

    switch (browseMode) {
      case 'type': {
        // Type mode: group by node type
        // Define type order (important types first), custom at the end
        const typeOrder = ['theorem', 'lemma', 'axiom', 'definition', 'structure', 'class', 'instance', 'inductive', 'example', 'custom']
        const groups: Record<string, SearchResult[]> = {}

        for (const result of allResults) {
          const kind = result.kind || 'unknown'
          if (!groups[kind]) groups[kind] = []
          groups[kind].push(result)
        }

        // Sort within groups by usedByCount descending
        for (const kind of Object.keys(groups)) {
          groups[kind].sort((a, b) => b.usedByCount - a.usedByCount)
        }

        // Arrange by predefined order, unknown types at the end
        const sortedKinds = Object.keys(groups).sort((a, b) => {
          const aIndex = typeOrder.indexOf(a)
          const bIndex = typeOrder.indexOf(b)
          if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
          if (aIndex === -1) return 1
          if (bIndex === -1) return -1
          return aIndex - bIndex
        })

        return sortedKinds.map(kind => ({
          key: `type-${kind}`,
          label: TYPE_LABELS[kind] || kind,
          color: KIND_COLORS[kind] || '#666',
          kind: kind,
          items: groups[kind],
        }))
      }

      case 'az': {
        // A-Z mode: group by first letter, sort within groups by usedByCount descending
        const groups: Record<string, SearchResult[]> = {}
        for (const result of allResults) {
          const firstChar = result.name.charAt(0).toUpperCase()
          const key = /[A-Z]/.test(firstChar) ? firstChar : '#'
          if (!groups[key]) groups[key] = []
          groups[key].push(result)
        }
        // Sort within groups by usedByCount descending
        for (const key of Object.keys(groups)) {
          groups[key].sort((a, b) => b.usedByCount - a.usedByCount)
        }
        // Arrange groups in alphabetical order
        return Object.keys(groups)
          .sort((a, b) => a === '#' ? 1 : b === '#' ? -1 : a.localeCompare(b))
          .map(key => ({
            key,
            label: key,
            items: groups[key],
          }))
      }

      case 'popular': {
        // Popular mode: group by usedByCount
        const ranges = [
          { min: 10, max: Infinity, label: 'Hot', icon: Icons.fire },
          { min: 5, max: 9, label: 'Common', icon: Icons.star },
          { min: 1, max: 4, label: 'Rare', icon: Icons.pin },
          { min: 0, max: 0, label: 'Unused', icon: Icons.sleep },
        ]
        const groups: Group[] = []
        for (const range of ranges) {
          const items = allResults.filter(r =>
            r.usedByCount >= range.min && r.usedByCount <= range.max
          ).sort((a, b) => b.usedByCount - a.usedByCount)
          if (items.length > 0) {
            groups.push({
              key: `popular-${range.min}-${range.max}`,
              label: range.label,
              icon: range.icon,
              items,
            })
          }
        }
        return groups
      }

      case 'links': {
        // Links mode: group by dependsOnCount
        const ranges = [
          { min: 10, max: Infinity, label: 'Complex' },
          { min: 5, max: 9, label: 'Medium' },
          { min: 1, max: 4, label: 'Simple' },
          { min: 0, max: 0, label: 'Independent' },
        ]
        const groups: Group[] = []
        for (const range of ranges) {
          const items = allResults.filter(r =>
            r.dependsOnCount >= range.min && r.dependsOnCount <= range.max
          ).sort((a, b) => b.dependsOnCount - a.dependsOnCount)
          if (items.length > 0) {
            groups.push({
              key: `links-${range.min}-${range.max}`,
              label: range.label,
              icon: Icons.link,
              items,
            })
          }
        }
        return groups
      }

      case 'depth': {
        // Depth mode: group by depth, deepest first
        const maxDepth = Math.max(...allResults.map(r => r.depth), 0)
        const groups: Group[] = []
        // Iterate from deepest to shallowest
        for (let d = maxDepth; d >= 0; d--) {
          const items = allResults.filter(r => r.depth === d)
            .sort((a, b) => b.usedByCount - a.usedByCount)
          if (items.length > 0) {
            groups.push({
              key: `depth-${d}`,
              label: `Depth ${d}`,
              icon: Icons.layers,
              items,
            })
          }
        }
        return groups
      }
    }
  }, [allResults, browseMode])

  // When selectedNodeId changes, scroll to the node and expand its group
  useEffect(() => {
    if (!selectedNodeId) return

    // Find the group containing the selected node and expand it
    const groupKey = groupedResults.find(g => g.items.some(item => item.id === selectedNodeId))?.key
    if (groupKey) {
      setCollapsedGroups(prev => {
        // If 'all', expand the group containing selected node (others stay collapsed)
        if (prev === 'all') {
          const allKeys = new Set(groupedResults.map(g => g.key))
          allKeys.delete(groupKey)
          return allKeys
        }
        if (prev.has(groupKey)) {
          const next = new Set(prev)
          next.delete(groupKey)
          return next
        }
        return prev
      })
    }

    // Delay scroll, wait for group to expand before scrolling
    const timer = setTimeout(() => {
      const nodeEl = nodeRefs.current.get(selectedNodeId)
      if (nodeEl && scrollContainerRef.current) {
        nodeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [selectedNodeId, groupedResults])

  // Render single node item
  const renderNodeItem = (result: SearchResult) => {
    const isVisible = isNodeVisible(result.id)
    const isSelected = selectedNodeId === result.id
    const kindColor = KIND_COLORS[result.kind] || '#666'

    return (
      <button
        key={result.id}
        ref={(el) => {
          if (el) {
            nodeRefs.current.set(result.id, el)
          } else {
            nodeRefs.current.delete(result.id)
          }
        }}
        onClick={() => handleNodeClick(result)}
        className={`w-full text-left p-2 pl-6 border-b border-white/5 transition-colors ${
          isSelected
            ? 'bg-blue-500/20 border-l-2 border-l-blue-400'
            : isVisible
              ? 'hover:bg-white/10'
              : 'opacity-50 hover:opacity-80 hover:bg-white/5'
        }`}
      >
        <div className="flex-1 min-w-0">
          {/* Name - colored by kind, break after dots */}
          <div
            className={`text-sm font-mono ${isVisible ? '' : 'opacity-50'}`}
            style={{ color: kindColor }}
          >
            {result.name.split('.').map((part, i, arr) => (
              <div key={i}>
                {i > 0 && <span className="text-white/30">.</span>}
                {part}
              </div>
            ))}
          </div>

          {/* Meta */}
          <div className={`flex items-center gap-2 mt-1 text-xs ${isVisible ? 'text-white/40' : 'text-white/30'}`}>
            <span>{TYPE_LABELS[result.kind] || result.kind} {kindIndices[result.id]}</span>
            {browseMode === 'popular' && result.usedByCount > 0 && (
              <span className={isVisible ? 'text-blue-400' : 'text-blue-400/50'}>↑{result.usedByCount}</span>
            )}
            {browseMode === 'links' && result.dependsOnCount > 0 && (
              <span className={isVisible ? 'text-purple-400' : 'text-purple-400/50'}>→{result.dependsOnCount}</span>
            )}
            {browseMode === 'depth' && (
              <span className={isVisible ? 'text-green-400' : 'text-green-400/50'}>d{result.depth}</span>
            )}
            {result.status === 'sorry' && (
              <span className={isVisible ? 'text-yellow-500' : 'text-yellow-500/50'}>sorry</span>
            )}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className={`flex flex-col bg-[#111] border-r border-white/10 ${className}`}>
      {/* Search input */}
      <div className="p-3 border-b border-white/10">
        <div className="relative">
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="Search theorems, lemmas..."
            className="w-full bg-[#1a1a1a] border border-white/20 rounded px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/40"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
            </div>
          )}
        </div>
        <div className="mt-2 text-xs text-white/40">
          {visibleNodes.length} nodes on canvas
        </div>
      </div>

      {/* Browse mode buttons */}
      <div className="p-2 border-b border-white/10 overflow-x-auto scrollbar-thin">
        <div className="flex gap-1 min-w-max">
          {([
            { mode: 'type' as const, label: 'Type' },
            { mode: 'az' as const, label: 'A-Z' },
            { mode: 'popular' as const, label: 'Popular' },
            { mode: 'links' as const, label: 'Links' },
            { mode: 'depth' as const, label: 'Depth' },
          ]).map(({ mode, label }) => (
            <button
              key={mode}
              onClick={() => handleBrowseModeChange(mode)}
              className={`flex-shrink-0 px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap ${
                browseMode === mode
                  ? 'bg-blue-500/30 text-blue-300 border border-blue-500/50'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grouped Results */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {groupedResults.length === 0 && !isSearching && (
          <div className="p-4 text-center text-white/40 text-sm">
            {localQuery.trim() ? 'No results found' : 'Loading nodes...'}
          </div>
        )}

        {groupedResults.map((group) => {
          // 'all' means all collapsed, otherwise check if in collapsed set
          const isCollapsed = collapsedGroups === 'all' || collapsedGroups.has(group.key)
          return (
            <div key={group.key}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.key, groupedResults)}
                className="w-full flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-left sticky top-0 z-10 border-b border-white/10"
              >
                <span className="text-white/60 text-xs">
                  {isCollapsed ? '▶' : '▼'}
                </span>
                {group.color && (
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: group.color }}
                  />
                )}
                {group.icon && (
                  <span className="text-white/60">{group.icon}</span>
                )}
                <span className="text-sm text-white/80 font-medium">
                  {group.label}
                </span>
                <span className="text-xs text-white/40 ml-auto">
                  {group.items.length}
                </span>
              </button>

              {/* Group items */}
              {!isCollapsed && group.items.map(renderNodeItem)}
            </div>
          )
        })}
      </div>

    </div>
  )
}

export default SearchPanel

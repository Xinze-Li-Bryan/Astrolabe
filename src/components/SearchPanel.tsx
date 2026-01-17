'use client'

/**
 * SearchPanel - Node search panel
 *
 * Search theorems/lemmas in the project, click to select node displayed in right panel
 * Supports two browse modes:
 * - Namespace: A-Z letter → Namespace → Type hierarchy with depth selector, sorted by popularity
 * - Popular: Group by usage count (usedByCount)
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useCanvasStore, SearchResult } from '@/lib/canvasStore'
import { KIND_COLORS } from '@/lib/store'
import { extractNamespace, getNamespaceDepthPreview } from '@/lib/graphProcessing'

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
type BrowseMode = 'namespace' | 'popular'

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
  level?: number  // 0: letter, 1: namespace, 2: type
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
  } = useCanvasStore()

  const [localQuery, setLocalQuery] = useState(searchQuery)
  const [browseMode, setBrowseMode] = useState<BrowseMode>('namespace')
  const [namespaceDepth, setNamespaceDepth] = useState(1)

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

  // Calculate namespace depth preview for the depth selector
  const namespaceDepthPreview = useMemo(() => {
    // Convert SearchResult to minimal node format for getNamespaceDepthPreview
    const nodes = allResults.map(r => ({ id: r.id, name: r.name, kind: r.kind as any }))
    return getNamespaceDepthPreview(nodes as any, 5)
  }, [allResults])

  // Group results based on browse mode
  const groupedResults = useMemo((): Group[] => {
    if (allResults.length === 0) return []

    switch (browseMode) {
      case 'namespace': {
        // Namespace mode: A-Z → Namespace → Type hierarchy
        const typeOrder = ['theorem', 'lemma', 'axiom', 'definition', 'structure', 'class', 'instance', 'inductive', 'example', 'custom']

        // First, group by namespace at current depth
        const namespaceGroups: Record<string, SearchResult[]> = {}
        for (const result of allResults) {
          const ns = extractNamespace(result.name, namespaceDepth) || '(root)'
          if (!namespaceGroups[ns]) namespaceGroups[ns] = []
          namespaceGroups[ns].push(result)
        }

        // Group namespaces by first letter (A-Z), non-letters go to #
        const letterGroups: Record<string, string[]> = {}
        for (const ns of Object.keys(namespaceGroups)) {
          let letter = '#'
          if (ns !== '(root)' && ns.length > 0) {
            const firstChar = ns[0].toUpperCase()
            // Only use A-Z as letter groups, everything else goes to #
            if (firstChar >= 'A' && firstChar <= 'Z') {
              letter = firstChar
            }
          }
          if (!letterGroups[letter]) letterGroups[letter] = []
          letterGroups[letter].push(ns)
        }

        // Sort letters alphabetically, with # at the end
        const sortedLetters = Object.keys(letterGroups).sort((a, b) => {
          if (a === '#') return 1
          if (b === '#') return -1
          return a.localeCompare(b)
        })

        // Sort namespaces within each letter group
        for (const letter of sortedLetters) {
          letterGroups[letter].sort((a, b) => {
            if (a === '(root)') return 1
            if (b === '(root)') return -1
            return a.localeCompare(b)
          })
        }

        const groups: Group[] = []

        for (const letter of sortedLetters) {
          // Add letter header group (level 0)
          groups.push({
            key: `letter-${letter}`,
            label: letter,
            level: 0,
            items: [], // Letter group has no direct items
          })

          // Add namespaces under this letter
          for (const ns of letterGroups[letter]) {
            const nsItems = namespaceGroups[ns]

            // Add namespace group (level 1)
            groups.push({
              key: `ns-${ns}`,
              label: ns,
              icon: Icons.layers,
              level: 1,
              items: [], // Namespace group has no direct items when showing types
            })

            // Sub-group by type within namespace
            const typeGroups: Record<string, SearchResult[]> = {}
            for (const item of nsItems) {
              const kind = item.kind || 'unknown'
              if (!typeGroups[kind]) typeGroups[kind] = []
              typeGroups[kind].push(item)
            }

            // Sort within type groups by popularity (usedByCount)
            for (const kind of Object.keys(typeGroups)) {
              typeGroups[kind].sort((a, b) => b.usedByCount - a.usedByCount)
            }

            // Arrange types by predefined order
            const sortedKinds = Object.keys(typeGroups).sort((a, b) => {
              const aIndex = typeOrder.indexOf(a)
              const bIndex = typeOrder.indexOf(b)
              if (aIndex === -1 && bIndex === -1) return a.localeCompare(b)
              if (aIndex === -1) return 1
              if (bIndex === -1) return -1
              return aIndex - bIndex
            })

            // Add type subgroups (level 2)
            for (const kind of sortedKinds) {
              groups.push({
                key: `ns-${ns}-type-${kind}`,
                label: TYPE_LABELS[kind] || kind,
                color: KIND_COLORS[kind] || '#666',
                kind: kind,
                level: 2,
                items: typeGroups[kind],
              })
            }
          }
        }

        return groups
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
    }
  }, [allResults, browseMode, namespaceDepth])

  // When selectedNodeId changes, scroll to the node and expand its group
  useEffect(() => {
    if (!selectedNodeId) return

    // Find the group containing the selected node
    const typeGroup = groupedResults.find(g => g.items.some(item => item.id === selectedNodeId))
    if (!typeGroup) return

    // For namespace mode, we need to expand the parent groups too
    // Group keys are like: letter-M, ns-Mathlib.Algebra, ns-Mathlib.Algebra-type-theorem
    const keysToExpand: string[] = [typeGroup.key]

    if (browseMode === 'namespace' && typeGroup.key.includes('-type-')) {
      // Extract namespace key from type group key (remove -type-xxx suffix)
      const nsKey = typeGroup.key.replace(/-type-[^-]+$/, '')
      keysToExpand.push(nsKey)

      // Find the letter group for this namespace
      const nsGroup = groupedResults.find(g => g.key === nsKey)
      if (nsGroup) {
        // Get first letter of namespace label
        const label = nsGroup.label
        const firstChar = label[0]?.toUpperCase()
        if (firstChar && firstChar >= 'A' && firstChar <= 'Z') {
          keysToExpand.push(`letter-${firstChar}`)
        } else {
          keysToExpand.push('letter-#')
        }
      }
    }

    // Collapse all groups except the path to the selected node
    setCollapsedGroups(() => {
      const allKeys = new Set(groupedResults.map(g => g.key))
      for (const key of keysToExpand) {
        allKeys.delete(key)
      }
      return allKeys
    })

    // Delay scroll, wait for groups to expand before scrolling
    const timer = setTimeout(() => {
      const nodeEl = nodeRefs.current.get(selectedNodeId)
      if (nodeEl && scrollContainerRef.current) {
        nodeEl.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }
    }, 150)

    return () => clearTimeout(timer)
  }, [selectedNodeId, groupedResults, browseMode])

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
            {result.name.split('.').map((part, i) => (
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
      <div className="p-2 border-b border-white/10">
        <div className="flex gap-1">
          {([
            { mode: 'namespace' as const, label: 'Namespace' },
            { mode: 'popular' as const, label: 'Popular' },
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

        {/* Namespace mode: Depth selector */}
        {browseMode === 'namespace' && (
          <div className="mt-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="text-white/40">Depth:</span>
              <div className="flex gap-0.5">
                {namespaceDepthPreview.map(info => (
                  <div key={info.depth} className="relative group">
                    <button
                      onClick={() => setNamespaceDepth(info.depth)}
                      className={`px-2 py-0.5 rounded text-[10px] transition-colors ${
                        namespaceDepth === info.depth
                          ? 'bg-purple-500/30 text-purple-300'
                          : 'bg-white/5 text-white/40 hover:bg-white/10'
                      }`}
                    >
                      {info.depth}
                    </button>
                    {/* Hover popup */}
                    <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block">
                      <div className="bg-[#1a1a1a] border border-white/20 rounded-lg shadow-xl p-2 min-w-[150px] max-w-[250px] max-h-[200px] overflow-y-auto">
                        <div className="text-[10px] text-white/50 mb-1">
                          Level {info.depth} ({info.count} groups)
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {info.namespaces.map(ns => (
                            <div key={ns} className="text-[11px] text-white/80 truncate">
                              {ns}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Grouped Results */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {groupedResults.length === 0 && !isSearching && (
          <div className="p-4 text-center text-white/40 text-sm">
            {localQuery.trim() ? 'No results found' : 'Loading nodes...'}
          </div>
        )}

        {(() => {
          // Track collapsed parent levels to hide children
          let collapsedLetterKey: string | null = null
          let collapsedNsKey: string | null = null

          return groupedResults.map((group, index) => {
            const level = group.level ?? 0
            const isCollapsed = collapsedGroups === 'all' || collapsedGroups.has(group.key)
            const hasItems = group.items.length > 0

            // Update collapsed parent tracking
            if (level === 0) {
              collapsedLetterKey = isCollapsed ? group.key : null
              collapsedNsKey = null // Reset namespace tracking when entering new letter
            } else if (level === 1) {
              // If parent letter is collapsed, this namespace is hidden
              if (collapsedLetterKey) return null
              collapsedNsKey = isCollapsed ? group.key : null
            } else if (level === 2) {
              // If parent letter or namespace is collapsed, this type is hidden
              if (collapsedLetterKey || collapsedNsKey) return null
            }

            // Calculate total items under this group (for letter/namespace headers)
            let totalItems = group.items.length
            if (level < 2) {
              // Count items in child groups
              for (let i = index + 1; i < groupedResults.length; i++) {
                const child = groupedResults[i]
                const childLevel = child.level ?? 0
                if (childLevel <= level) break // Reached next sibling or parent
                if (childLevel === 2) totalItems += child.items.length
              }
            }

            // Style based on level
            const levelStyles = {
              0: 'pl-2 py-1.5 bg-white/10 text-white font-bold text-sm', // Letter header
              1: 'pl-4 py-1.5 bg-white/5 text-white/70 text-sm', // Namespace header
              2: 'pl-8 py-1.5 bg-transparent hover:bg-white/5 text-white/60 text-xs', // Type header
            }[level] || ''

            return (
              <div key={group.key}>
                {/* Group header */}
                <button
                  onClick={() => toggleGroup(group.key, groupedResults)}
                  className={`w-full flex items-center gap-2 text-left border-b border-white/5 ${levelStyles}`}
                >
                  {/* Arrow */}
                  <span className="text-white/40 text-[10px] w-3">
                    {isCollapsed ? '▶' : '▼'}
                  </span>
                  {/* Type color dot */}
                  {group.color && (
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: group.color }}
                    />
                  )}
                  {/* Namespace icon */}
                  {group.icon && level === 1 && (
                    <span className="text-white/40">{group.icon}</span>
                  )}
                  <span className="truncate">
                    {group.label}
                  </span>
                  {/* Item count */}
                  {totalItems > 0 && (
                    <span className="text-[10px] text-white/30 ml-auto pr-2">
                      {totalItems}
                    </span>
                  )}
                </button>

                {/* Group items (only for level 2 type groups) */}
                {!isCollapsed && hasItems && group.items.map(renderNodeItem)}
              </div>
            )
          })
        })()}
      </div>

    </div>
  )
}

export default SearchPanel

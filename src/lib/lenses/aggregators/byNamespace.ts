/**
 * byNamespace Aggregator
 *
 * Groups nodes by their namespace prefix, creating "bubble" nodes
 * for collapsed groups. Supports recursive expansion - expanding a bubble
 * shows sub-namespace bubbles at the next depth level.
 *
 * This makes large graphs with many namespaces navigable while preventing
 * accidental FPS drops from showing too many nodes at once.
 */

import type {
  Node,
  Edge,
  LensAggregate,
  LensAggregateContext,
  NamespaceGroup,
  AggregateResult,
} from '../types'

// ============================================
// Namespace Extraction
// ============================================

/**
 * Extract namespace prefix from a fully-qualified name
 *
 * @param name - Full name like "Mathlib.Algebra.Group.Basic.add_comm"
 * @param depth - How many segments to include (1 = "Mathlib", 2 = "Mathlib.Algebra", etc.)
 * @returns Namespace prefix
 */
export function extractNamespace(name: string, depth: number): string {
  if (!name || depth === 0) return name

  const parts = name.split('.')
  const nsDepth = Math.min(depth, parts.length)
  return parts.slice(0, nsDepth).join('.')
}

/**
 * Get display label for a namespace (last segment)
 */
function getNamespaceLabel(namespace: string): string {
  const parts = namespace.split('.')
  return parts[parts.length - 1] || namespace
}

/**
 * Get the depth (number of segments) of a namespace
 */
function getNamespaceDepth(namespace: string): number {
  if (!namespace) return 0
  return namespace.split('.').length
}

// ============================================
// Recursive Namespace Grouping
// ============================================

interface GroupingResult {
  bubbleNodes: Node[]
  visibleNodes: Node[]
  groups: NamespaceGroup[]
  nodeToGroup: Map<string, string>
}

/**
 * Recursively group nodes by namespace, respecting expanded state.
 *
 * Algorithm:
 * 1. Group nodes at current depth
 * 2. For each group:
 *    - If collapsed: show as bubble
 *    - If expanded AND has sub-namespaces meeting threshold: recurse at depth+1
 *    - If expanded AND nodes below threshold: show individual nodes
 */
function groupNodesRecursively(
  nodes: Node[],
  baseDepth: number,
  collapseThreshold: number,
  expandedGroups: Set<string>,
  parentNamespace: string | null = null
): GroupingResult {
  const result: GroupingResult = {
    bubbleNodes: [],
    visibleNodes: [],
    groups: [],
    nodeToGroup: new Map(),
  }

  if (nodes.length === 0) return result

  // Group nodes by namespace at current depth
  const namespaceMap = new Map<string, Node[]>()

  for (const node of nodes) {
    const ns = extractNamespace(node.name, baseDepth)
    if (!namespaceMap.has(ns)) {
      namespaceMap.set(ns, [])
    }
    namespaceMap.get(ns)!.push(node)
  }

  for (const [namespace, nsNodes] of namespaceMap) {
    const groupId = `group:${namespace}`
    const isExpanded = expandedGroups.has(groupId)

    // Does this group meet the collapse threshold?
    const shouldCollapse = nsNodes.length >= collapseThreshold

    if (!shouldCollapse) {
      // Below threshold - show all individual nodes
      for (const node of nsNodes) {
        result.visibleNodes.push(node)
      }
      continue
    }

    if (!isExpanded) {
      // Collapsed - show as a bubble
      // Use last part of namespace as label, with node count
      const shortLabel = getNamespaceLabel(namespace)
      const bubbleNode: Node = {
        id: groupId,
        name: `${shortLabel}\n(${nsNodes.length})`,  // Show short name + count
        kind: 'custom',
        status: 'unknown',
        defaultColor: '#a855f7', // Purple for namespace bubbles (matches BUBBLE_COLOR in Node3D)
        defaultSize: Math.min(3.5, 1.2 + Math.log10(nsNodes.length)), // Slightly larger
        defaultShape: 'sphere',
        pinned: false,
        visible: true,
      }
      result.bubbleNodes.push(bubbleNode)

      result.groups.push({
        id: groupId,
        namespace,
        label: getNamespaceLabel(namespace),
        nodeIds: nsNodes.map(n => n.id),
        nodeCount: nsNodes.length,
        expanded: false,
      })

      // Map nodes to this group for edge transformation
      for (const node of nsNodes) {
        result.nodeToGroup.set(node.id, groupId)
      }
    } else {
      // Expanded - check if we can go deeper
      const currentDepth = getNamespaceDepth(namespace)
      const maxNodeDepth = Math.max(...nsNodes.map(n => getNamespaceDepth(n.name)))

      // Can we create sub-namespaces?
      if (maxNodeDepth > currentDepth) {
        // Recurse at next depth level
        const subResult = groupNodesRecursively(
          nsNodes,
          currentDepth + 1,
          collapseThreshold,
          expandedGroups,
          namespace
        )

        // Add sub-results
        result.bubbleNodes.push(...subResult.bubbleNodes)
        result.visibleNodes.push(...subResult.visibleNodes)
        result.groups.push(...subResult.groups)
        for (const [nodeId, grpId] of subResult.nodeToGroup) {
          result.nodeToGroup.set(nodeId, grpId)
        }

        // Also track the parent group as expanded
        result.groups.push({
          id: groupId,
          namespace,
          label: getNamespaceLabel(namespace),
          nodeIds: nsNodes.map(n => n.id),
          nodeCount: nsNodes.length,
          expanded: true,
        })
      } else {
        // Can't go deeper - show all individual nodes
        for (const node of nsNodes) {
          result.visibleNodes.push(node)
        }

        // Track as expanded group
        result.groups.push({
          id: groupId,
          namespace,
          label: getNamespaceLabel(namespace),
          nodeIds: nsNodes.map(n => n.id),
          nodeCount: nsNodes.length,
          expanded: true,
        })
      }
    }
  }

  return result
}

// ============================================
// Aggregator Implementation
// ============================================

/**
 * Extended context with expandedGroups from store
 */
interface ExtendedAggregateContext extends LensAggregateContext {
  expandedGroups?: Set<string>
}

/**
 * Group nodes by namespace prefix with recursive expansion support
 */
export const byNamespaceAggregator: LensAggregate = (
  nodes: Node[],
  edges: Edge[],
  context: LensAggregateContext
): AggregateResult => {
  const { options } = context
  const extendedContext = context as ExtendedAggregateContext
  const namespaceDepth = options.namespaceDepth ?? 2
  const collapseThreshold = options.collapseThreshold ?? 3
  const expandedGroups = extendedContext.expandedGroups ?? new Set<string>()

  // Handle empty input
  if (nodes.length === 0) {
    return { nodes: [], edges: [], groups: [] }
  }

  // Recursively group nodes
  const grouping = groupNodesRecursively(
    nodes,
    namespaceDepth,
    collapseThreshold,
    expandedGroups
  )

  // Combine bubble nodes and visible individual nodes
  const outputNodes = [...grouping.bubbleNodes, ...grouping.visibleNodes]

  // Transform edges
  const seenEdges = new Set<string>()
  const outputEdges: Edge[] = []

  for (const edge of edges) {
    const sourceGroup = grouping.nodeToGroup.get(edge.source)
    const targetGroup = grouping.nodeToGroup.get(edge.target)

    // Determine effective source/target (bubble or original)
    const effectiveSource = sourceGroup ?? edge.source
    const effectiveTarget = targetGroup ?? edge.target

    // Skip internal edges (both in same group)
    if (sourceGroup && sourceGroup === targetGroup) {
      continue
    }

    // Skip edges where both endpoints are hidden (in collapsed groups)
    const sourceVisible = outputNodes.some(n => n.id === effectiveSource)
    const targetVisible = outputNodes.some(n => n.id === effectiveTarget)
    if (!sourceVisible || !targetVisible) {
      continue
    }

    // Deduplicate
    const edgeKey = `${effectiveSource}->${effectiveTarget}`
    if (seenEdges.has(edgeKey)) {
      continue
    }
    seenEdges.add(edgeKey)

    // Create transformed edge
    outputEdges.push({
      ...edge,
      id: edgeKey,
      source: effectiveSource,
      target: effectiveTarget,
    })
  }

  return {
    nodes: outputNodes,
    edges: outputEdges,
    groups: grouping.groups,
  }
}

export default byNamespaceAggregator

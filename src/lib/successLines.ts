/**
 * Calculate node status lines for Monaco Editor glyph margin
 *
 * Returns line numbers and their status for displaying icons.
 */

import type { AstrolabeNode } from '@/types/graph'

export interface NodeStatusLine {
  line: number
  status: 'proven' | 'sorry' | 'error' | 'stated' | 'unknown'
}

/**
 * Calculate which lines should show status decorations and what status
 *
 * @param currentFilePath - Path of the file being displayed
 * @param nodes - All nodes from the graph
 * @returns Array of line numbers with their status
 */
export function calculateNodeStatusLines(
  currentFilePath: string | undefined,
  nodes: AstrolabeNode[]
): NodeStatusLine[] {
  if (!currentFilePath) return []

  // Get line numbers and status of all nodes in current file
  return nodes
    .filter(node =>
      node.leanFile?.path === currentFilePath &&
      node.leanFile?.line
    )
    .map(node => ({
      line: node.leanFile!.line,
      status: node.status,
    }))
}

/**
 * Calculate which lines should show success (green checkmark) decorations
 * @deprecated Use calculateNodeStatusLines instead
 */
export function calculateSuccessLines(
  currentFilePath: string | undefined,
  nodes: AstrolabeNode[]
): number[] {
  return calculateNodeStatusLines(currentFilePath, nodes)
    .filter(n => n.status === 'proven')
    .map(n => n.line)
}

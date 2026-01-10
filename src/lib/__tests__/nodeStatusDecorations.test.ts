/**
 * Tests for node status decorations in Monaco Editor
 *
 * Three Celestial Signs (San Xiang):
 * - proven -> 🜲 XuanJi (Star, XuanJi Cyan #00F5D4) - Eternal star, proof complete
 * - sorry -> ⚝ HengGuang (Crescent Moon, HengGuang Gold #F4D35E) - Waxing moon, needs completion
 * - error -> ☾ LiWei (Circled X, LiWei Vermillion #EF476F) - Star out of place, has errors
 * - unknown/stated -> no icon
 *
 * When error diagnostic exists on a line, no status icon should appear
 */

import { describe, it, expect } from 'vitest'

// Types matching the actual implementation
interface NodeStatusLine {
  line: number
  status: 'proven' | 'sorry' | 'error' | 'stated' | 'unknown'
}

interface Diagnostic {
  startLine: number
  severity: 'error' | 'warning' | 'info' | 'hint'
}

interface StatusDecoration {
  line: number
  type: 'success' | 'sorry' | 'error'
}

/**
 * Calculate which status decorations to show
 * This mirrors the logic in MonacoLeanEditor
 */
function calculateStatusDecorations(
  nodeStatusLines: NodeStatusLine[],
  diagnostics: Diagnostic[]
): StatusDecoration[] {
  const decorations: StatusDecoration[] = []

  // Get lines that have error diagnostics
  const errorDiagnosticLines = new Set(
    diagnostics.filter(d => d.severity === 'error').map(d => d.startLine)
  )

  for (const { line, status } of nodeStatusLines) {
    // Skip unknown/stated - no icon
    if (status === 'unknown' || status === 'stated') continue

    // Skip if this line has an error diagnostic (diagnostic icon takes priority)
    if (errorDiagnosticLines.has(line)) continue

    if (status === 'proven') {
      decorations.push({ line, type: 'success' })
    } else if (status === 'sorry') {
      decorations.push({ line, type: 'sorry' })
    } else if (status === 'error') {
      decorations.push({ line, type: 'error' })
    }
  }

  return decorations
}

describe('Node Status Decorations', () => {
  describe('status to icon mapping', () => {
    it('proven status should show Star (XuanJi)', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'proven' }],
        []
      )
      expect(result).toEqual([{ line: 10, type: 'success' }])
    })

    it('sorry status should show Crescent Moon (HengGuang)', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'sorry' }],
        []
      )
      expect(result).toEqual([{ line: 10, type: 'sorry' }])
    })

    it('unknown status should show no icon', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'unknown' }],
        []
      )
      expect(result).toEqual([])
    })

    it('stated status should show no icon', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'stated' }],
        []
      )
      expect(result).toEqual([])
    })

    it('error status should show Circled X (LiWei)', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'error' }],
        []
      )
      expect(result).toEqual([{ line: 10, type: 'error' }])
    })
  })

  describe('error diagnostic handling', () => {
    it('should NOT show status icon when error diagnostic is on same line', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'sorry' }],
        [{ startLine: 10, severity: 'error' }]
      )
      // No status decoration - error diagnostic takes priority
      expect(result).toEqual([])
    })

    it('should NOT show success icon when error diagnostic is on same line', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'proven' }],
        [{ startLine: 10, severity: 'error' }]
      )
      expect(result).toEqual([])
    })

    it('should show status icon when error is on different line', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'sorry' }],
        [{ startLine: 15, severity: 'error' }] // error on different line
      )
      expect(result).toEqual([{ line: 10, type: 'sorry' }])
    })

    it('warning diagnostic should NOT block status icon', () => {
      const result = calculateStatusDecorations(
        [{ line: 10, status: 'sorry' }],
        [{ startLine: 10, severity: 'warning' }]
      )
      // Warning doesn't block - still show sorry icon
      expect(result).toEqual([{ line: 10, type: 'sorry' }])
    })
  })

  describe('multiple nodes', () => {
    it('should handle mixed statuses correctly', () => {
      const result = calculateStatusDecorations(
        [
          { line: 10, status: 'proven' },
          { line: 20, status: 'sorry' },
          { line: 30, status: 'unknown' },
          { line: 40, status: 'stated' },
        ],
        []
      )
      expect(result).toEqual([
        { line: 10, type: 'success' },
        { line: 20, type: 'sorry' },
        // line 30 and 40 have no icons
      ])
    })

    it('should only hide icon for line with error, not others', () => {
      const result = calculateStatusDecorations(
        [
          { line: 10, status: 'proven' },
          { line: 20, status: 'sorry' },  // this has error
          { line: 30, status: 'proven' },
        ],
        [{ startLine: 20, severity: 'error' }]
      )
      expect(result).toEqual([
        { line: 10, type: 'success' },
        // line 20 hidden due to error
        { line: 30, type: 'success' },
      ])
    })
  })
})

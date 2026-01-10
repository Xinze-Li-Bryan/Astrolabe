'use client'

/**
 * LeanCodePanel Component
 *
 * Monaco-based code panel that wraps MonacoLeanEditor with:
 * - Header with file name, line number, range info
 * - Node info display (name and kind)
 * - Close button
 * - Full LeanCodeViewer interface compatibility
 */

import React from 'react'
import { XMarkIcon, CodeBracketIcon } from '@heroicons/react/24/outline'
import { MonacoLeanEditor, type Diagnostic, type NodeStatusLine } from './MonacoLeanEditor'

export interface LeanCodePanelProps {
  /** File content to display */
  content: string
  /** File path */
  filePath?: string
  /** File name (overrides extracted from filePath) */
  fileName?: string
  /** Target line number to jump to (1-indexed) */
  lineNumber?: number
  /** Content start line (1-indexed) */
  startLine?: number
  /** Content end line */
  endLine?: number
  /** Total lines in file */
  totalLines?: number
  /** Node name to display */
  nodeName?: string
  /** Node kind/type to display */
  nodeKind?: string
  /** Close callback */
  onClose: () => void
  /** Hide the header bar */
  hideHeader?: boolean
  /** Whether the editor is read-only */
  readOnly?: boolean
  /** Callback when content changes */
  onChange?: (content: string) => void
  /** Callback when user saves (Ctrl+S / Cmd+S) */
  onSave?: (content: string) => void
  /** Diagnostics to display (error/warning underlines) */
  diagnostics?: Diagnostic[]
  /** Node status for each line (shows status icons) */
  nodeStatusLines?: NodeStatusLine[]
  /** @deprecated Use nodeStatusLines instead */
  successLines?: number[]
}

export function LeanCodePanel({
  content,
  filePath,
  fileName: fileNameProp,
  lineNumber,
  startLine = 1,
  endLine,
  totalLines,
  nodeName,
  nodeKind,
  onClose,
  hideHeader = false,
  readOnly = false,
  onChange,
  onSave,
  diagnostics,
  nodeStatusLines,
  successLines,
}: LeanCodePanelProps) {
  const fileName = fileNameProp || filePath?.split('/').pop() || 'code.lean'

  return (
    <div className="h-full flex flex-col bg-[#0d1117]">
      {/* Header */}
      {!hideHeader && (
        <div className="h-8 border-b border-white/10 flex items-center justify-between px-3 bg-black/50 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs text-white/60 flex items-center gap-1">
              <CodeBracketIcon className="w-3 h-3" />
              Code
            </span>
            <span className="text-white/20">|</span>
            <span className="text-cyan-400 text-xs font-mono truncate">
              {fileName}
            </span>
            {lineNumber && (
              <span className="text-white/40 text-xs">
                :{lineNumber}
              </span>
            )}
            {totalLines && (
              <span className="text-white/20 text-xs">
                ({startLine}-{endLine} / {totalLines})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded transition-colors"
            aria-label="close"
          >
            <XMarkIcon className="w-3 h-3 text-white/40" />
          </button>
        </div>
      )}

      {/* Node info */}
      {nodeName && (
        <div className="px-3 py-2 border-b border-white/10 bg-black/30" data-testid="node-info">
          <div className="flex items-center gap-2">
            {nodeKind && (
              <span className="text-purple-400 text-xs font-medium">
                {nodeKind}
              </span>
            )}
            <span className="text-white/80 text-sm font-mono break-all">
              {nodeName}
            </span>
          </div>
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <MonacoLeanEditor
          content={content}
          filePath={filePath || '/untitled.lean'}
          lineNumber={lineNumber}
          readOnly={readOnly}
          onChange={onChange}
          onSave={onSave}
          diagnostics={diagnostics}
          nodeStatusLines={nodeStatusLines}
          successLines={successLines}
        />
      </div>
    </div>
  )
}

export default LeanCodePanel

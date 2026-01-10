import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { MonacoLeanEditor, Diagnostic } from '../MonacoLeanEditor'

// Mock Monaco Editor - simplified mock that immediately calls onMount
vi.mock('@monaco-editor/react', () => ({
  default: vi.fn(({ onMount, value }) => {
    // Don't call onMount in this simplified mock to avoid complexity
    return (
      <div data-testid="monaco-editor" data-value={value}>
        Monaco Editor Mock
      </div>
    )
  }),
}))

describe('MonacoLeanEditor', () => {
  const defaultProps = {
    content: 'theorem test : True := trivial',
    filePath: '/test/file.lean',
  }

  describe('Basic rendering', () => {
    it('should render the editor', () => {
      render(<MonacoLeanEditor {...defaultProps} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })

    it('should show loading state initially', () => {
      render(<MonacoLeanEditor {...defaultProps} />)
      expect(screen.getByText('Loading editor...')).toBeInTheDocument()
    })

    it('should pass content to editor', () => {
      render(<MonacoLeanEditor {...defaultProps} />)
      const editor = screen.getByTestId('monaco-editor')
      expect(editor).toHaveAttribute('data-value', 'theorem test : True := trivial')
    })
  })

  describe('CSS styles for diagnostic glyphs', () => {
    it('should include CSS styles for error glyph with red color', () => {
      render(<MonacoLeanEditor {...defaultProps} />)

      const styleContent = document.querySelector('style')?.textContent || ''
      expect(styleContent).toContain('.diagnostic-glyph-error')
      expect(styleContent).toMatch(/#e74c3c/i) // red color (Astrolabe theme)
    })

    // Note: warning/info/hint glyph styles were removed as they're not used
    // Only error, success, sorry, and node-error glyphs are displayed

    it('should include CSS styles for node error glyph with moon (LiWei)', () => {
      render(<MonacoLeanEditor {...defaultProps} />)

      const styleContent = document.querySelector('style')?.textContent || ''
      expect(styleContent).toContain('.diagnostic-glyph-node-error')
      expect(styleContent).toContain('content: "☾"')
      expect(styleContent).toMatch(/#EF476F/i) // LiWei Vermillion
    })

    it('should include CSS styles for success glyph with star (XuanJi)', () => {
      render(<MonacoLeanEditor {...defaultProps} />)

      const styleContent = document.querySelector('style')?.textContent || ''
      expect(styleContent).toContain('.diagnostic-glyph-success')
      expect(styleContent).toContain('content: "🜲"')
      expect(styleContent).toMatch(/#00F5D4/i) // XuanJi Cyan
    })

    it('should include CSS styles for sorry glyph with crescent moon (HengGuang)', () => {
      render(<MonacoLeanEditor {...defaultProps} />)

      const styleContent = document.querySelector('style')?.textContent || ''
      expect(styleContent).toContain('.diagnostic-glyph-sorry')
      expect(styleContent).toContain('content: "⚝"')
      expect(styleContent).toMatch(/#F4D35E/i) // HengGuang Gold
    })

    it('should include line highlight styles', () => {
      render(<MonacoLeanEditor {...defaultProps} />)

      const styleContent = document.querySelector('style')?.textContent || ''
      expect(styleContent).toContain('.monaco-line-highlight')
      // Line highlight uses cyan gradient with left border (no glyph margin)
      expect(styleContent).toContain('#00F5D4')
    })
  })

  describe('Diagnostic type definitions', () => {
    it('should accept valid diagnostic objects', () => {
      const diagnostics: Diagnostic[] = [
        {
          startLine: 5,
          startColumn: 1,
          endLine: 5,
          endColumn: 10,
          message: 'unexpected token',
          severity: 'error',
        },
        {
          startLine: 10,
          startColumn: 3,
          endLine: 10,
          endColumn: 15,
          message: 'declaration uses sorry',
          severity: 'warning',
        },
        {
          startLine: 15,
          startColumn: 1,
          endLine: 15,
          endColumn: 5,
          message: 'info message',
          severity: 'info',
        },
        {
          startLine: 20,
          startColumn: 1,
          endLine: 20,
          endColumn: 5,
          message: 'hint message',
          severity: 'hint',
        },
      ]

      // This test verifies TypeScript types are correct
      render(<MonacoLeanEditor {...defaultProps} diagnostics={diagnostics} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })
  })

  describe('Props handling', () => {
    it('should accept readOnly prop', () => {
      render(<MonacoLeanEditor {...defaultProps} readOnly={true} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })

    it('should accept lineNumber prop', () => {
      render(<MonacoLeanEditor {...defaultProps} lineNumber={10} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })

    it('should accept className prop', () => {
      render(<MonacoLeanEditor {...defaultProps} className="custom-class" />)
      const wrapper = screen.getByTestId('monaco-editor').parentElement
      expect(wrapper).toHaveClass('custom-class')
    })

    it('should accept onChange callback', () => {
      const onChange = vi.fn()
      render(<MonacoLeanEditor {...defaultProps} onChange={onChange} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })

    it('should accept onSave callback', () => {
      const onSave = vi.fn()
      render(<MonacoLeanEditor {...defaultProps} onSave={onSave} />)
      expect(screen.getByTestId('monaco-editor')).toBeInTheDocument()
    })
  })
})

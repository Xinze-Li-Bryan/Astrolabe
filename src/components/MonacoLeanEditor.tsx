/**
 * MonacoLeanEditor Component
 *
 * Monaco-based code editor for Lean4 with:
 * - Lean4 syntax highlighting
 * - Diagnostics display (error/warning underlines)
 * - Line jumping and highlighting
 * - File editing with save support
 */

import React, { useRef, useCallback, useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import Editor, { OnMount, OnChange, BeforeMount } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { PROOF_STATUS_CONFIG } from "@/lib/proofStatus";
import { isHarmlessError } from "@/lib/errorSuppression";

// ============================================
// Error Boundary for Monaco Editor
// ============================================

interface MonacoErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface MonacoErrorBoundaryState {
  hasError: boolean;
}

/**
 * Error Boundary that catches Monaco "Canceled" errors during unmount
 * These errors are harmless and occur when the editor is disposed
 */
class MonacoErrorBoundary extends Component<MonacoErrorBoundaryProps, MonacoErrorBoundaryState> {
  constructor(props: MonacoErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): MonacoErrorBoundaryState {
    // Don't show error state for known harmless errors
    if (isHarmlessError(error)) {
      return { hasError: false };
    }
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Ignore known harmless errors
    if (isHarmlessError(error)) {
      return;
    }
    console.error("MonacoLeanEditor error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex items-center justify-center h-full bg-gray-900 text-gray-400">
          <span>Editor error. Please refresh.</span>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================
// Types
// ============================================

export interface Diagnostic {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
}

export interface NodeStatusLine {
  line: number;
  status: 'proven' | 'sorry' | 'error' | 'stated' | 'unknown';
}

export interface MonacoLeanEditorProps {
  /** File content to display */
  content: string;
  /** File path (used for Monaco model URI) */
  filePath: string;
  /** Line number to jump to and highlight */
  lineNumber?: number;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /** Callback when content changes */
  onChange?: (content: string) => void;
  /** Callback when user saves (Ctrl+S / Cmd+S) */
  onSave?: (content: string) => void;
  /** Diagnostics to display (error/warning underlines) */
  diagnostics?: Diagnostic[];
  /** Node status for each line (shows status icons: ✓ proven, ⚠ sorry, ✗ error) */
  nodeStatusLines?: NodeStatusLine[];
  /** @deprecated Use nodeStatusLines instead */
  successLines?: number[];
  /** Additional CSS class */
  className?: string;
}

// ============================================
// Lean4 Language Configuration
// ============================================

const registerLean4Language = (monaco: typeof import("monaco-editor")) => {
  // Check if already registered
  const languages = monaco.languages.getLanguages();
  const isRegistered = languages.some((lang) => lang.id === "lean4");

  // Define Astrolabe theme - matches project color scheme
  // Node type colors from src/lib/store.ts KIND_COLORS
  monaco.editor.defineTheme("astrolabe", {
    base: "vs-dark",
    inherit: false,
    rules: [
      // Background and default text
      { token: "", foreground: "d4d4d4", background: "000000" },

      // Comments - soft gray italic
      { token: "comment", foreground: "6a737d", fontStyle: "italic" },

      // Declaration keywords - use project colors
      { token: "keyword.theorem", foreground: "A855F7", fontStyle: "bold" },  // theorem - purple
      { token: "keyword.lemma", foreground: "6366F1", fontStyle: "bold" },    // lemma - indigo
      { token: "keyword.def", foreground: "FBBF24", fontStyle: "bold" },      // def - amber
      { token: "keyword.axiom", foreground: "FB923C", fontStyle: "bold" },    // axiom - orange
      { token: "keyword.structure", foreground: "2DD4BF", fontStyle: "bold" },// structure - teal
      { token: "keyword.class", foreground: "4ADE80", fontStyle: "bold" },    // class - green
      { token: "keyword.instance", foreground: "38BDF8", fontStyle: "bold" }, // instance - sky
      { token: "keyword.inductive", foreground: "F472B6", fontStyle: "bold" },// inductive - pink
      { token: "keyword.example", foreground: "818CF8", fontStyle: "bold" },  // example - violet

      // Other keywords - subtle purple-gray
      { token: "keyword", foreground: "c792ea" },
      { token: "keyword.control", foreground: "c792ea" },

      // Tactics - soft cyan
      { token: "keyword.tactic", foreground: "89ddff" },

      // Types - teal/cyan
      { token: "type", foreground: "4ec9b0" },
      { token: "type.identifier", foreground: "4ec9b0" },

      // Strings - soft green
      { token: "string", foreground: "a5d6a7" },
      { token: "string.char", foreground: "a5d6a7" },
      { token: "string.escape", foreground: "81c784" },
      { token: "string.invalid", foreground: "f48fb1", background: "1a0000" },

      // Numbers - soft orange
      { token: "number", foreground: "ffcc80" },
      { token: "number.float", foreground: "ffcc80" },

      // Operators - light gray-blue
      { token: "operator", foreground: "89ddff" },

      // Identifiers - soft white
      { token: "identifier", foreground: "d4d4d4" },

      // Brackets/delimiters - gold
      { token: "delimiter", foreground: "ffd700" },
      { token: "delimiter.parenthesis", foreground: "ffd700" },
      { token: "delimiter.brace", foreground: "da70d6" },
      { token: "delimiter.bracket", foreground: "179fff" },
      { token: "delimiter.angle", foreground: "4ec9b0" },
    ],
    colors: {
      // Editor background - pure black
      "editor.background": "#000000",
      "editor.foreground": "#d4d4d4",

      // Selection - purple tint
      "editor.selectionBackground": "#A855F730",
      "editor.selectionHighlightBackground": "#A855F715",
      "editor.inactiveSelectionBackground": "#A855F715",

      // Line highlight - subtle
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.lineHighlightBorder": "#ffffff15",

      // Cursor - gold
      "editorCursor.foreground": "#ffd700",

      // Line numbers
      "editorLineNumber.foreground": "#4a4a4a",
      "editorLineNumber.activeForeground": "#858585",

      // Glyph margin
      "editorGutter.background": "#000000",

      // Scrollbar
      "scrollbar.shadow": "#00000000",
      "scrollbarSlider.background": "#ffffff10",
      "scrollbarSlider.hoverBackground": "#ffffff20",
      "scrollbarSlider.activeBackground": "#ffffff30",

      // Widget/hover backgrounds
      "editorWidget.background": "#0a0a0a",
      "editorWidget.border": "#2a2a2a",
      "editorHoverWidget.background": "#0a0a0a",
      "editorHoverWidget.border": "#2a2a2a",

      // Matching brackets
      "editorBracketMatch.background": "#ffd70020",
      "editorBracketMatch.border": "#ffd70060",

      // Find match
      "editor.findMatchBackground": "#FBBF2440",
      "editor.findMatchHighlightBackground": "#FBBF2420",

      // Word highlight
      "editor.wordHighlightBackground": "#A855F715",
      "editor.wordHighlightStrongBackground": "#A855F725",

      // Minimap
      "minimap.background": "#000000",
      "minimap.selectionHighlight": "#A855F750",

      // Indent guides
      "editorIndentGuide.background": "#1a1a1a",
      "editorIndentGuide.activeBackground": "#3a3a3a",
    },
  });

  if (isRegistered) {
    return;
  }

  // Register the Lean4 language
  monaco.languages.register({ id: "lean4" });

  // Lean4 syntax highlighting rules
  monaco.languages.setMonarchTokensProvider("lean4", {
    // Declaration keywords - these get special colors matching node types
    declKeywords: [
      "theorem",
      "lemma",
      "def",
      "axiom",
      "example",
      "abbrev",
      "structure",
      "class",
      "instance",
      "inductive",
    ],
    // Other keywords
    keywords: [
      "where",
      "extends",
      "deriving",
      "namespace",
      "section",
      "open",
      "variable",
      "universe",
      "import",
      "export",
      "private",
      "protected",
      "partial",
      "noncomputable",
      "unsafe",
      "mutual",
      "if",
      "then",
      "else",
      "match",
      "with",
      "do",
      "return",
      "let",
      "have",
      "fun",
      "by",
      "at",
      "in",
      "for",
      "unless",
      "try",
      "catch",
      "finally",
      "macro",
      "syntax",
      "macro_rules",
      "set_option",
      "attribute",
      "local",
      "scoped",
      "sorry",
    ],
    tactics: [
      "intro",
      "intros",
      "apply",
      "exact",
      "refine",
      "rfl",
      "trivial",
      "simp",
      "simp_all",
      "ring",
      "linarith",
      "omega",
      "decide",
      "rw",
      "rewrite",
      "have",
      "let",
      "show",
      "calc",
      "induction",
      "cases",
      "rcases",
      "obtain",
      "constructor",
      "ext",
      "funext",
      "congr",
      "assumption",
      "contradiction",
      "exfalso",
      "push_neg",
      "by_contra",
      "by_cases",
      "use",
      "exists",
      "left",
      "right",
      "split",
      "norm_num",
      "norm_cast",
      "field_simp",
      "ring_nf",
      "aesop",
      "tauto",
      "done",
      "all_goals",
      "any_goals",
      "first",
      "repeat",
      "iterate",
    ],
    types: [
      "Type",
      "Prop",
      "Sort",
      "Nat",
      "Int",
      "Bool",
      "String",
      "Char",
      "Float",
      "Unit",
      "True",
      "False",
      "List",
      "Array",
      "Option",
      "Sum",
      "Prod",
      "Sigma",
      "Subtype",
      "Fin",
      "UInt8",
      "UInt16",
      "UInt32",
      "UInt64",
      "USize",
    ],
    operators: [
      ":=",
      "=>",
      "→",
      "←",
      "↔",
      "∧",
      "∨",
      "¬",
      "∀",
      "∃",
      "λ",
      "⊢",
      "⊣",
      "≤",
      "≥",
      "≠",
      "∈",
      "∉",
      "⊆",
      "⊂",
      "∪",
      "∩",
      "×",
      "++",
      "|>",
      "<|",
      ">>",
      ">>=",
      "++",
      "+",
      "-",
      "*",
      "/",
      "%",
      "^",
      "=",
      "<",
      ">",
      "!",
      "&",
      "|",
      "~",
    ],
    brackets: [
      { open: "(", close: ")", token: "delimiter.parenthesis" },
      { open: "{", close: "}", token: "delimiter.brace" },
      { open: "[", close: "]", token: "delimiter.bracket" },
      { open: "⟨", close: "⟩", token: "delimiter.angle" },
    ],
    tokenizer: {
      root: [
        // Comments
        [/--.*$/, "comment"],
        [/\/-/, "comment", "@blockComment"],

        // Strings
        [/"([^"\\]|\\.)*$/, "string.invalid"],
        [/"/, "string", "@string"],

        // Characters
        [/'[^\\']'/, "string.char"],
        [/'\\.'/, "string.char"],

        // Numbers
        [/\d+\.\d+/, "number.float"],
        [/\d+/, "number"],

        // Identifiers and keywords
        [
          /[a-zA-Z_][\w']*|[\u03B1-\u03C9][\w']*/,
          {
            cases: {
              // Declaration keywords with specific colors
              "theorem": "keyword.theorem",
              "lemma": "keyword.lemma",
              "def": "keyword.def",
              "abbrev": "keyword.def",
              "axiom": "keyword.axiom",
              "structure": "keyword.structure",
              "class": "keyword.class",
              "instance": "keyword.instance",
              "inductive": "keyword.inductive",
              "example": "keyword.example",
              // Other keywords
              "@keywords": "keyword",
              "@tactics": "keyword.tactic",
              "@types": "type",
              "@default": "identifier",
            },
          },
        ],

        // Unicode symbols
        [/[∀∃λ→←↔∧∨¬⊢⊣≤≥≠∈∉⊆⊂∪∩×ℕℤℚℝℂ]/, "operator"],

        // Standard operators
        [/:=|=>|->|<-|<->/, "operator"],
        [/[+\-*/^%=<>!&|~]+/, "operator"],

        // Brackets
        [/[(){}[\]⟨⟩]/, "@brackets"],

        // Whitespace
        [/\s+/, "white"],
      ],
      blockComment: [
        [/[^-/]+/, "comment"],
        [/-\//, "comment", "@pop"],
        [/[-/]/, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
    },
  });

  // Language configuration for brackets, comments, etc.
  monaco.languages.setLanguageConfiguration("lean4", {
    comments: {
      lineComment: "--",
      blockComment: ["/-", "-/"],
    },
    brackets: [
      ["(", ")"],
      ["{", "}"],
      ["[", "]"],
      ["⟨", "⟩"],
    ],
    autoClosingPairs: [
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "⟨", close: "⟩" },
    ],
    surroundingPairs: [
      { open: "(", close: ")" },
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  });
};

// ============================================
// Component
// ============================================

// Severity priority for determining which glyph to show when multiple diagnostics on same line
const SEVERITY_PRIORITY: Record<Diagnostic["severity"], number> = {
  error: 0,
  warning: 1,
  info: 2,
  hint: 3,
};

export function MonacoLeanEditor({
  content,
  filePath,
  lineNumber,
  readOnly = false,
  onChange,
  onSave,
  diagnostics,
  nodeStatusLines,
  successLines,
  className,
}: MonacoLeanEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const diagnosticDecorationsRef = useRef<string[]>([]);
  const nodeStatusDecorationsRef = useRef<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editorReady, setEditorReady] = useState(false);  // Track if editor is mounted
  const isMountedRef = useRef(true);

  // Track mounted state
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Handle before mount - define theme before editor renders
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    // Register language and define theme BEFORE editor mounts
    registerLean4Language(monaco);
  }, []);

  // Handle editor mount
  const handleEditorMount: OnMount = useCallback(
    (editor, monaco) => {
      if (!isMountedRef.current) return;
      editorRef.current = editor;
      monacoRef.current = monaco;
      setIsLoading(false);
      setEditorReady(true);  // Mark editor as ready, trigger highlighting useEffect

      // Highlighting logic moved to useEffect for unified handling, avoiding closure issues

      // Add Ctrl+S / Cmd+S save handler
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        if (onSave) {
          onSave(editor.getValue());
        }
      });
    },
    [onSave]
  );

  // Handle content changes
  const handleChange: OnChange = useCallback(
    (value) => {
      if (onChange && value !== undefined) {
        onChange(value);
      }
    },
    [onChange]
  );

  // Update line highlighting when lineNumber changes or editor becomes ready
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (!editorReady) return;  // Wait for editor to be ready
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !lineNumber || lineNumber <= 0) return;

    try {
      // Jump to line
      editor.revealLineInCenter(lineNumber);
      editor.setPosition({ lineNumber, column: 1 });

      // Highlight the line
      const newDecorations = editor.deltaDecorations(decorationsRef.current, [
        {
          range: new monaco.Range(lineNumber, 1, lineNumber, 1),
          options: {
            isWholeLine: true,
            className: "monaco-line-highlight",
          },
        },
      ]);
      decorationsRef.current = newDecorations;
    } catch (e) {
      // Ignore errors during unmount
      if (isMountedRef.current) {
        console.warn("Error updating line highlight:", e);
      }
    }
  }, [lineNumber, editorReady]);

  // Update diagnostics (error/warning markers and glyph decorations)
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (!editorReady) return;  // Wait for editor to finish mounting
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    try {
      const model = editor.getModel();
      if (!model) return;

      if (!diagnostics || diagnostics.length === 0) {
        monaco.editor.setModelMarkers(model, "lean4", []);
        // Clear glyph decorations
        diagnosticDecorationsRef.current = editor.deltaDecorations(
          diagnosticDecorationsRef.current,
          []
        );
        return;
      }

      // Set Monaco markers (underlines)
      const markers: editor.IMarkerData[] = diagnostics.map((d) => ({
        startLineNumber: d.startLine,
        startColumn: d.startColumn,
        endLineNumber: d.endLine,
        endColumn: d.endColumn,
        message: d.message,
        severity:
          d.severity === "error"
            ? monaco.MarkerSeverity.Error
            : d.severity === "warning"
              ? monaco.MarkerSeverity.Warning
              : d.severity === "info"
                ? monaco.MarkerSeverity.Info
                : monaco.MarkerSeverity.Hint,
      }));

      monaco.editor.setModelMarkers(model, "lean4", markers);

      // Group diagnostics by line for glyph margin decorations
      const diagnosticsByLine = new Map<number, Diagnostic[]>();
      for (const d of diagnostics) {
        const line = d.startLine;
        if (!diagnosticsByLine.has(line)) {
          diagnosticsByLine.set(line, []);
        }
        diagnosticsByLine.get(line)!.push(d);
      }

      // Create glyph decorations (one per line, only for errors)
      // Warning/info/hint don't show glyph icons - node status icons handle sorry warnings
      const glyphDecorations: editor.IModelDeltaDecoration[] = [];
      for (const [line, lineDiagnostics] of diagnosticsByLine) {
        // Only show glyph for errors
        const errors = lineDiagnostics.filter(d => d.severity === 'error');
        if (errors.length === 0) continue;

        // Combine all error messages for hover tooltip
        const allMessages = errors
          .map((d) => `**ERROR**: ${d.message}`)
          .join("\n\n");

        glyphDecorations.push({
          range: new monaco.Range(line, 1, line, 1),
          options: {
            glyphMarginClassName: 'diagnostic-glyph-error',
            glyphMarginHoverMessage: { value: allMessages },
          },
        });
      }

      diagnosticDecorationsRef.current = editor.deltaDecorations(
        diagnosticDecorationsRef.current,
        glyphDecorations
      );
    } catch (e) {
      // Ignore errors during unmount (e.g., "Canceled" errors)
      if (isMountedRef.current) {
        console.warn("Error updating diagnostics:", e);
      }
    }
  }, [diagnostics, editorReady]);  // Add editorReady dependency

  // Update node status decorations (✓ proven, ⚠ sorry, shows on theorem/lemma declaration line)
  useEffect(() => {
    if (!isMountedRef.current) return;
    if (!editorReady) return;  // Wait for editor to finish mounting
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    try {
      const statusDecorations: editor.IModelDeltaDecoration[] = [];

      // Get lines that have error diagnostics - these take priority over status icons
      const errorLines = new Set(
        diagnostics?.filter(d => d.severity === 'error').map(d => d.startLine) || []
      );

      // New behavior: use nodeStatusLines if available
      if (nodeStatusLines && nodeStatusLines.length > 0) {
        for (const { line, status } of nodeStatusLines) {
          // Skip unknown/stated status - don't show any icon
          if (status === 'unknown' || status === 'stated') continue;

          // Skip if this line has an error diagnostic (diagnostic icon takes priority)
          if (errorLines.has(line)) continue;

          let glyphClassName: string;
          let hoverMessage: string;

          switch (status) {
            case 'proven':
              glyphClassName = 'diagnostic-glyph-success';
              hoverMessage = '🜲 Verified';
              break;
            case 'sorry':
              glyphClassName = 'diagnostic-glyph-sorry';
              hoverMessage = '⚝ Contains sorry';
              break;
            case 'error':
              glyphClassName = 'diagnostic-glyph-node-error';
              hoverMessage = '☾ Has errors';
              break;
            default:
              continue;
          }

          statusDecorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              glyphMarginClassName: glyphClassName,
              glyphMarginHoverMessage: { value: hoverMessage },
            },
          });
        }
      } else if (successLines && successLines.length > 0) {
        // Legacy behavior: only show green checkmarks for successLines
        for (const line of successLines) {
          if (errorLines.has(line)) continue;
          statusDecorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              glyphMarginClassName: 'diagnostic-glyph-success',
              glyphMarginHoverMessage: { value: '✓ Verified' },
            },
          });
        }
      }

      nodeStatusDecorationsRef.current = editor.deltaDecorations(
        nodeStatusDecorationsRef.current,
        statusDecorations
      );
    } catch (e) {
      if (isMountedRef.current) {
        console.warn("Error updating node status decorations:", e);
      }
    }
  }, [nodeStatusLines, successLines, diagnostics, editorReady]);  // Add editorReady dependency

  // Clean up decorations on unmount
  useEffect(() => {
    return () => {
      if (editorRef.current) {
        // Monaco will auto-dispose when component unmounts via @monaco-editor/react
      }
    };
  }, []);

  return (
    <MonacoErrorBoundary>
      <div className={`monaco-lean-editor relative h-full w-full ${className || ""}`}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <span className="text-cyan-400/60">Loading editor...</span>
          </div>
        )}
        <Editor
          height="100%"
          defaultLanguage="lean4"
          language="lean4"
          theme="astrolabe"
          value={content}
          onChange={handleChange}
          beforeMount={handleBeforeMount}
          onMount={handleEditorMount}
          keepCurrentModel={true}
          options={{
            readOnly,
            automaticLayout: true,
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            folding: true,
            renderLineHighlight: "line",
            selectOnLineNumbers: true,
            glyphMargin: true,
            // Unicode support - Lean uses many unicode math symbols
            fontFamily: "'JetBrains Mono', 'Fira Code', Consolas, 'Courier New', monospace",
            fontLigatures: true,
            // Disable ambiguous unicode highlighting (Lean uses unicode math symbols)
            unicodeHighlight: {
              ambiguousCharacters: false,
              invisibleCharacters: false,
            },
          }}
        />
        {/* CSS for line highlighting and diagnostic glyphs - Astrolabe theme */}
        <style>{`
        .monaco-line-highlight {
          background: linear-gradient(90deg, rgba(0, 245, 212, 0.2) 0%, rgba(0, 245, 212, 0.02) 100%) !important;
          border-left: 3px solid ${PROOF_STATUS_CONFIG.proven.color} !important;
        }
        /* Glyph icons - celestial symbols matching project theme */
        .diagnostic-glyph-error,
        .diagnostic-glyph-success,
        .diagnostic-glyph-sorry,
        .diagnostic-glyph-node-error {
          display: flex !important;
          align-items: center;
          justify-content: center;
          width: 16px !important;
          height: 16px !important;
          margin-left: 2px;
          margin-top: 2px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1;
        }
        /* Diagnostic error - red circle */
        .diagnostic-glyph-error::before {
          content: "●";
          color: #e74c3c;
        }
        /* Node status: proven (三象 - 炼金符号) */
        .diagnostic-glyph-success::before {
          content: "${PROOF_STATUS_CONFIG.proven.symbol}";
          color: ${PROOF_STATUS_CONFIG.proven.color};
        }
        /* Node status: sorry (五芒星) */
        .diagnostic-glyph-sorry::before {
          content: "${PROOF_STATUS_CONFIG.sorry.symbol}";
          color: ${PROOF_STATUS_CONFIG.sorry.color};
        }
        /* Node status: error (月牙) */
        .diagnostic-glyph-node-error::before {
          content: "${PROOF_STATUS_CONFIG.error.symbol}";
          color: ${PROOF_STATUS_CONFIG.error.color};
        }
      `}</style>
      </div>
    </MonacoErrorBoundary>
  );
}

export default MonacoLeanEditor;

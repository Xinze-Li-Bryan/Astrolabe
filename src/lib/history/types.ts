/**
 * Undo/Redo Command Types
 *
 * A Command represents a user-driven mutation that can be undone/redone.
 * Commands are the atomic unit of the history system.
 */

export type CommandScope = 'graph' | 'lens' | 'canvas' | 'ui' | 'viewport'

export interface Command {
  /** Unique identifier for debugging */
  id: string

  /** Human-readable label for UI ("Move node", "Edit notes", etc.) */
  label: string

  /** Scope for filtering/disabling undo in certain contexts */
  scope: CommandScope

  /** When the command was created */
  timestamp: number

  /** Execute the command (forward) */
  do(): Promise<void> | void

  /** Reverse the command */
  undo(): Promise<void> | void

  /**
   * Optional: Check if this command can merge with the next one.
   * Used for coalescing high-frequency actions (drag, typing, sliders).
   */
  canMerge?(next: Command): boolean

  /**
   * Optional: Merge this command with the next one.
   * Returns a new command representing both operations.
   */
  merge?(next: Command): Command
}

/**
 * Options for executing a command
 */
export interface ExecuteOptions {
  /** If true, skip adding to history (for internal replays) */
  skipHistory?: boolean

  /** If true, merge with previous command if possible */
  tryMerge?: boolean
}

/**
 * History state for external consumption (e.g., UI indicators)
 */
export interface HistoryState {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
  undoCount: number
  redoCount: number
}

/**
 * Listener for history state changes
 */
export type HistoryListener = (state: HistoryState) => void

/**
 * HistoryManager - Centralized undo/redo management
 *
 * The single source of truth for command history. All undoable mutations
 * should go through this manager via execute().
 *
 * Features:
 * - Undo/redo stacks with configurable max depth
 * - Command merging for high-frequency actions
 * - Transaction support for grouping multiple commands
 * - State subscriptions for UI updates
 * - History invalidation for external changes
 */

import type { Command, ExecuteOptions, HistoryState, HistoryListener, CommandScope } from './types'

const MAX_HISTORY_SIZE = 100
const MERGE_WINDOW_MS = 750

export class HistoryManager {
  private undoStack: Command[] = []
  private redoStack: Command[] = []
  private listeners: Set<HistoryListener> = new Set()
  private isReplaying = false
  private transactionCommands: Command[] | null = null
  private transactionLabel: string | null = null
  private disabledScopes: Set<CommandScope> = new Set()

  /**
   * Execute a command and add it to the history
   */
  async execute(command: Command, options: ExecuteOptions = {}): Promise<void> {
    // If in transaction, collect commands
    if (this.transactionCommands !== null) {
      await command.do()
      this.transactionCommands.push(command)
      return
    }

    // Skip history during undo/redo replay
    if (options.skipHistory || this.isReplaying) {
      await command.do()
      return
    }

    // Check if scope is disabled
    if (this.disabledScopes.has(command.scope)) {
      await command.do()
      return
    }

    // Try to merge with previous command
    if (options.tryMerge && this.undoStack.length > 0) {
      const prev = this.undoStack[this.undoStack.length - 1]
      const timeDiff = command.timestamp - prev.timestamp

      if (
        timeDiff < MERGE_WINDOW_MS &&
        prev.canMerge?.(command) &&
        prev.merge
      ) {
        // Merge: replace previous command with merged one
        const merged = prev.merge(command)
        this.undoStack[this.undoStack.length - 1] = merged
        await command.do()
        this.notifyListeners()
        return
      }
    }

    // Execute the command
    await command.do()

    // Add to undo stack
    this.undoStack.push(command)

    // Clear redo stack (new action invalidates redo history)
    this.redoStack = []

    // Trim history if too large
    if (this.undoStack.length > MAX_HISTORY_SIZE) {
      this.undoStack.shift()
    }

    this.notifyListeners()
  }

  /**
   * Undo the last command
   */
  async undo(): Promise<boolean> {
    const command = this.undoStack.pop()
    if (!command) return false

    this.isReplaying = true
    try {
      await command.undo()
      this.redoStack.push(command)
      this.notifyListeners()
      return true
    } finally {
      this.isReplaying = false
    }
  }

  /**
   * Redo the last undone command
   */
  async redo(): Promise<boolean> {
    const command = this.redoStack.pop()
    if (!command) return false

    this.isReplaying = true
    try {
      await command.do()
      this.undoStack.push(command)
      this.notifyListeners()
      return true
    } finally {
      this.isReplaying = false
    }
  }

  /**
   * Start a transaction - multiple commands grouped as one undo step
   */
  beginTransaction(label: string): void {
    if (this.transactionCommands !== null) {
      console.warn('[HistoryManager] Nested transactions not supported')
      return
    }
    this.transactionCommands = []
    this.transactionLabel = label
  }

  /**
   * Commit the current transaction as a single undo step
   */
  commitTransaction(): void {
    if (this.transactionCommands === null) {
      console.warn('[HistoryManager] No transaction to commit')
      return
    }

    const commands = this.transactionCommands
    const label = this.transactionLabel!
    this.transactionCommands = null
    this.transactionLabel = null

    if (commands.length === 0) return

    // Create a compound command
    const compoundCommand: Command = {
      id: `txn-${Date.now()}`,
      label,
      scope: commands[0].scope, // Use first command's scope
      timestamp: commands[0].timestamp,

      async do() {
        for (const cmd of commands) {
          await cmd.do()
        }
      },

      async undo() {
        // Undo in reverse order
        for (let i = commands.length - 1; i >= 0; i--) {
          await commands[i].undo()
        }
      },
    }

    this.undoStack.push(compoundCommand)
    this.redoStack = []
    this.notifyListeners()
  }

  /**
   * Rollback the current transaction (undo all commands in it)
   */
  async rollbackTransaction(): Promise<void> {
    if (this.transactionCommands === null) {
      console.warn('[HistoryManager] No transaction to rollback')
      return
    }

    const commands = this.transactionCommands
    this.transactionCommands = null
    this.transactionLabel = null

    // Undo in reverse order
    for (let i = commands.length - 1; i >= 0; i--) {
      await commands[i].undo()
    }
  }

  /**
   * Clear all history (e.g., after external changes invalidate it)
   */
  clear(reason?: string): void {
    this.undoStack = []
    this.redoStack = []
    if (reason) {
      console.log(`[HistoryManager] History cleared: ${reason}`)
    }
    this.notifyListeners()
  }

  /**
   * Temporarily disable undo tracking for a scope
   */
  disableScope(scope: CommandScope): void {
    this.disabledScopes.add(scope)
  }

  /**
   * Re-enable undo tracking for a scope
   */
  enableScope(scope: CommandScope): void {
    this.disabledScopes.delete(scope)
  }

  /**
   * Get current history state (for UI)
   */
  getState(): HistoryState {
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      undoLabel: this.undoStack.length > 0
        ? this.undoStack[this.undoStack.length - 1].label
        : null,
      redoLabel: this.redoStack.length > 0
        ? this.redoStack[this.redoStack.length - 1].label
        : null,
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    }
  }

  /**
   * Subscribe to history state changes
   */
  subscribe(listener: HistoryListener): () => void {
    this.listeners.add(listener)
    // Immediately notify with current state
    listener(this.getState())
    return () => this.listeners.delete(listener)
  }

  private notifyListeners(): void {
    const state = this.getState()
    this.listeners.forEach(listener => listener(state))
  }
}

// Singleton instance for app-wide use
export const history = new HistoryManager()

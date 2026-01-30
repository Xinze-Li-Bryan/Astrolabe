/**
 * PatchCommand - Immer-based command for store mutations
 *
 * Uses Immer patches for efficient undo/redo without full state snapshots.
 * Each command stores only the diff (patches + inverse patches).
 */

import { type Patch, applyPatches } from 'immer'
import type { Command, CommandScope } from './types'

let commandCounter = 0

export interface PatchCommandOptions<T> {
  label: string
  scope: CommandScope

  /** Function to get current state (e.g., store.getState) */
  getState: () => T

  /** Function to set new state (e.g., store.setState) */
  setState: (state: T) => void

  /** Patches to apply for do() */
  patches: Patch[]

  /** Inverse patches to apply for undo() */
  inversePatches: Patch[]

  /** Optional callback after do() - e.g., persist to backend */
  afterDo?: () => Promise<void> | void

  /** Optional callback after undo() - e.g., revert backend */
  afterUndo?: () => Promise<void> | void

  /** Optional: field to check for merging (e.g., 'nodeId') */
  mergeKey?: string

  /** Optional: value of merge key for this command */
  mergeValue?: string
}

export class PatchCommand<T> implements Command {
  id: string
  label: string
  scope: CommandScope
  timestamp: number

  private getState: () => T
  private setState: (state: T) => void
  private patches: Patch[]
  private inversePatches: Patch[]
  private afterDo?: () => Promise<void> | void
  private afterUndo?: () => Promise<void> | void
  private mergeKey?: string
  private mergeValue?: string

  constructor(options: PatchCommandOptions<T>) {
    this.id = `patch-${++commandCounter}`
    this.label = options.label
    this.scope = options.scope
    this.timestamp = Date.now()

    this.getState = options.getState
    this.setState = options.setState
    this.patches = options.patches
    this.inversePatches = options.inversePatches
    this.afterDo = options.afterDo
    this.afterUndo = options.afterUndo
    this.mergeKey = options.mergeKey
    this.mergeValue = options.mergeValue
  }

  async do(): Promise<void> {
    const currentState = this.getState()
    const newState = applyPatches(currentState as object, this.patches) as T
    this.setState(newState)
    await this.afterDo?.()
  }

  async undo(): Promise<void> {
    const currentState = this.getState()
    const newState = applyPatches(currentState as object, this.inversePatches) as T
    this.setState(newState)
    await this.afterUndo?.()
  }

  canMerge(next: Command): boolean {
    if (!(next instanceof PatchCommand)) return false
    if (next.scope !== this.scope) return false
    if (!this.mergeKey || !this.mergeValue) return false
    return (
      next.mergeKey === this.mergeKey &&
      next.mergeValue === this.mergeValue
    )
  }

  merge(next: Command): Command {
    if (!(next instanceof PatchCommand)) return this

    // Create merged command:
    // - Use combined patches (this.patches + next.patches)
    // - Use original inverse patches (this.inversePatches) to fully undo
    // - Use next's afterDo (most recent effect)
    // - Use this's afterUndo (original state restoration)
    return new PatchCommand<T>({
      label: this.label,
      scope: this.scope,
      getState: this.getState,
      setState: this.setState,
      patches: [...this.patches, ...next.patches],
      inversePatches: this.inversePatches, // Original inverse to fully revert
      afterDo: next.afterDo,
      afterUndo: this.afterUndo,
      mergeKey: this.mergeKey,
      mergeValue: this.mergeValue,
    })
  }
}

/**
 * Helper to create a simple command from do/undo functions
 */
export function createCommand(options: {
  label: string
  scope: CommandScope
  do: () => Promise<void> | void
  undo: () => Promise<void> | void
}): Command {
  return {
    id: `cmd-${++commandCounter}`,
    label: options.label,
    scope: options.scope,
    timestamp: Date.now(),
    do: options.do,
    undo: options.undo,
  }
}

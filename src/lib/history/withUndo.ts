/**
 * withUndo - Helper to create undoable store mutations
 *
 * Wraps a Zustand store mutation to automatically capture Immer patches
 * and register with the HistoryManager.
 *
 * Usage:
 *   const undoableSetOptions = withUndo(useLensStore, 'lens', 'Change lens options')
 *   undoableSetOptions(state => { state.options.nHop = 3 })
 */

import { produceWithPatches, enablePatches, type Draft } from 'immer'
import { history } from './HistoryManager'
import { PatchCommand } from './PatchCommand'
import type { CommandScope } from './types'

// Enable Immer patches globally
enablePatches()

// Compatible with both Zustand StoreApi and UseBoundStore
type StoreApi<T> = {
  getState: () => T
  setState: (state: T, replace: true) => void
}

/**
 * Create an undoable mutation function for a Zustand store
 *
 * @param store - The Zustand store (e.g., useLensStore)
 * @param scope - Command scope for filtering
 * @param label - Human-readable label for the undo stack
 * @param options - Additional options
 */
export function withUndo<T extends object>(
  store: StoreApi<T>,
  scope: CommandScope,
  label: string,
  options?: {
    /** Key for merging consecutive commands (e.g., 'optionKey') */
    mergeKey?: string
    /** Value for merge key (e.g., 'nHop') */
    mergeValue?: string
    /** Whether to try merging with previous command */
    tryMerge?: boolean
    /** Callback after do() */
    afterDo?: () => Promise<void> | void
    /** Callback after undo() */
    afterUndo?: () => Promise<void> | void
  }
) {
  return async (recipe: (draft: Draft<T>) => void): Promise<void> => {
    const currentState = store.getState()

    // Use Immer to produce patches
    const [nextState, patches, inversePatches] = produceWithPatches(
      currentState,
      recipe
    )

    // If no changes, skip
    if (patches.length === 0) return

    // Create the patch command
    const command = new PatchCommand<T>({
      label,
      scope,
      getState: () => store.getState(),
      setState: (state) => store.setState(state, true),
      patches,
      inversePatches,
      afterDo: options?.afterDo,
      afterUndo: options?.afterUndo,
      mergeKey: options?.mergeKey,
      mergeValue: options?.mergeValue,
    })

    // Execute through history manager
    await history.execute(command, { tryMerge: options?.tryMerge })
  }
}

/**
 * Create a simple undoable action (not patch-based)
 *
 * For actions where you manually define do/undo logic.
 */
export function undoable(
  scope: CommandScope,
  label: string,
  doFn: () => Promise<void> | void,
  undoFn: () => Promise<void> | void
): Promise<void> {
  const command = {
    id: `simple-${Date.now()}`,
    label,
    scope,
    timestamp: Date.now(),
    do: doFn,
    undo: undoFn,
  }

  return history.execute(command)
}

/**
 * Execute multiple undoable actions as a single undo step
 */
export async function transaction<T>(
  label: string,
  fn: () => Promise<T> | T
): Promise<T> {
  history.beginTransaction(label)
  try {
    const result = await fn()
    history.commitTransaction()
    return result
  } catch (error) {
    await history.rollbackTransaction()
    throw error
  }
}

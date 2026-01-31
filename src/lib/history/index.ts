/**
 * History Module - Undo/Redo system
 *
 * Usage:
 *   import { history, withUndo, undoable, transaction } from '@/lib/history'
 *
 *   // Undoable store mutation (recommended for Zustand)
 *   const updateOptions = withUndo(useLensStore, 'lens', 'Change options')
 *   await updateOptions(draft => { draft.options.nHop = 3 })
 *
 *   // Simple undoable action
 *   await undoable('ui', 'Toggle panel',
 *     () => setOpen(true),
 *     () => setOpen(false)
 *   )
 *
 *   // Transaction (group multiple commands)
 *   await transaction('Batch update', async () => {
 *     await doThing1()
 *     await doThing2()
 *   })
 *
 *   // Manual undo/redo
 *   history.undo()
 *   history.redo()
 */

export { history, HistoryManager } from './HistoryManager'
export { PatchCommand, createCommand } from './PatchCommand'
export { withUndo, undoable, transaction } from './withUndo'
export { graphActions } from './graphActions'
export { viewportActions } from './viewportActions'
export * from './lensActions'
export * from './selectionActions'
export type { Command, CommandScope, ExecuteOptions, HistoryState, HistoryListener } from './types'

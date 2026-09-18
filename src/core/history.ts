/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * History and Undo/Redo stack manager for CutFree Studio.
 */

export interface HistoryManager<T> {
  canUndo: boolean;
  canRedo: boolean;
  push: (state: T) => void;
  undo: (currentState: T) => T | null;
  redo: (currentState: T) => T | null;
  clear: () => void;
}

export function createHistory<T>(maxHistory: number = 40): HistoryManager<T> {
  let past: T[] = [];
  let future: T[] = [];

  return {
    get canUndo() {
      return past.length > 0;
    },
    get canRedo() {
      return future.length > 0;
    },
    push(state: T) {
      // Clone state to prevent external mutation
      const snapshot = JSON.parse(JSON.stringify(state));
      past.push(snapshot);
      if (past.length > maxHistory) {
        past.shift();
      }
      future = []; // Clear redo stack on new action
    },
    undo(currentState: T): T | null {
      if (past.length === 0) return null;
      const previous = past.pop()!;
      future.push(JSON.parse(JSON.stringify(currentState)));
      return previous;
    },
    redo(currentState: T): T | null {
      if (future.length === 0) return null;
      const next = future.pop()!;
      past.push(JSON.parse(JSON.stringify(currentState)));
      return next;
    },
    clear() {
      past = [];
      future = [];
    },
  };
}

/**
 * Undo/redo for Spec snapshots. Single history — not a second editor state.
 */

export class HistoryStack<T> {
  private past: T[] = [];
  private future: T[] = [];
  private current: T | null = null;
  readonly limit: number;

  constructor(limit = 40) {
    this.limit = limit;
  }

  seed(value: T) {
    this.current = clone(value);
    this.past = [];
    this.future = [];
  }

  push(next: T) {
    if (this.current != null) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = clone(next);
    this.future = [];
  }

  undo(): T | null {
    if (!this.past.length) return null;
    if (this.current != null) this.future.push(this.current);
    this.current = this.past.pop() as T;
    return clone(this.current);
  }

  redo(): T | null {
    if (!this.future.length) return null;
    if (this.current != null) this.past.push(this.current);
    this.current = this.future.pop() as T;
    return clone(this.current);
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
  get value(): T | null { return this.current ? clone(this.current) : null; }
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

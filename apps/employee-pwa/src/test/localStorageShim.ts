/**
 * Node 22+'s built-in `globalThis.localStorage` throws unless the process is
 * started with `--localstorage-file`; it also shadows jsdom's working
 * implementation because both define the same global property. Vitest's node
 * test environment (used for pure-logic tests such as `data/session.test.ts`)
 * has no DOM at all, so neither implementation is usable out of the box.
 *
 * This setup file replaces `globalThis.localStorage` with a minimal in-memory
 * `Storage` polyfill whenever the built-in one is missing or non-functional,
 * so tests can rely on the standard `localStorage` API without depending on
 * process flags or a jsdom environment.
 */
class MemoryStorage implements Storage {
  private readonly store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const hasWorkingLocalStorage =
  typeof globalThis.localStorage !== 'undefined' && typeof globalThis.localStorage?.clear === 'function';

if (!hasWorkingLocalStorage) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

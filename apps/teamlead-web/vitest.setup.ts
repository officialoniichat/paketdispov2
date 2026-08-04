import '@testing-library/jest-dom/vitest';

// Node 22+ bringt je nach Start-Flags ein eigenes — ohne gültiges
// `--localstorage-file` kaputtes — localStorage-Global mit (clear() fehlt),
// das jsdoms Implementierung verdeckt. In jsdom ist window === globalThis,
// darum ersetzt der Shim das Global durch einen In-Memory-Storage — App-Code
// (window.localStorage) und Tests teilen so denselben Speicher. Gleiches
// Muster wie employee-pwa/src/test/localStorageShim.ts.
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

if (typeof globalThis.localStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

/**
 * Tiny typed localStorage helper for persisted cockpit view state (C2) — the
 * first real "saved views". Every surface stores ONE JSON blob under a
 * `paket.view.*` key; corrupt/unavailable storage silently falls back so a
 * broken localStorage can never break the cockpit.
 */

/** Digitale Ablagen board: lane order + collapsed lanes. */
export const ABLAGEN_VIEW_KEY = 'paket.view.ablagen';
/** Beleg list: scope + sorting + column filters. */
export const BELEGE_VIEW_KEY = 'paket.view.belege';

/** Read a persisted view state; `fallback` on missing/corrupt/blocked storage. */
export function loadViewState<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Persist a view state (best effort — quota/privacy errors are swallowed). */
export function saveViewState<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Best effort: persistence is a convenience, never a hard dependency.
  }
}

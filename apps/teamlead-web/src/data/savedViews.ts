/**
 * Saved views for dense teamlead tables (Anhang E.6: "braucht Filter, schnelle
 * Tastaturbedienung und gespeicherte Views"). Persisted in localStorage so a
 * teamlead's column/filter/sort presets survive reloads without a backend.
 */

/** Opaque per-table state (TanStack Table column/sorting/filter snapshot). */
export type SavedViewState = Record<string, unknown>;

export interface SavedView {
  id: string;
  name: string;
  scope: string;
  state: SavedViewState;
}

const KEY_PREFIX = 'paket.teamlead.views.';

function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function listViews(scope: string): SavedView[] {
  const store = storage();
  if (!store) return [];
  try {
    const raw = store.getItem(KEY_PREFIX + scope);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SavedView[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeViews(scope: string, views: SavedView[]): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(KEY_PREFIX + scope, JSON.stringify(views));
  } catch {
    // Quota / private-mode: saved views are a convenience, never block the UI.
  }
}

/** Upserts a view by name within a scope and returns the new list. */
export function saveView(scope: string, name: string, state: SavedViewState): SavedView[] {
  const trimmed = name.trim();
  if (!trimmed) return listViews(scope);
  const existing = listViews(scope);
  const id = `${scope}:${trimmed.toLowerCase()}`;
  const next = existing.filter((v) => v.id !== id);
  next.push({ id, name: trimmed, scope, state });
  writeViews(scope, next);
  return next;
}

export function deleteView(scope: string, id: string): SavedView[] {
  const next = listViews(scope).filter((v) => v.id !== id);
  writeViews(scope, next);
  return next;
}

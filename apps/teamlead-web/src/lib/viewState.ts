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
/** Mitarbeiterboard: gewählte Ansicht (Liste vs. Kanban-Raster). */
export const BOARD_VIEW_KEY = 'paket.view.board';
/** Cockpit-Shell: schmale Sidebar (Nav-Rail) + ausgeklappte DA.M.B-Gruppe. */
export const NAV_VIEW_KEY = 'paket.view.nav';
/** DA.M.B: Splitter-Verhältnisse des 3-Fenster-Screens. */
export const EXPERIMENT_VIEW_KEY = 'paket.view.experiment';
/**
 * DA.M.B: Saved View der EINGEBETTETEN Beleg-Liste — eigener Key,
 * damit DA.M.B den Basis-Tab /belege nicht umkonfiguriert.
 */
export const EXPERIMENT_BELEGE_VIEW_KEY = 'paket.view.experiment.belege';
/** DA.M.B: Zoom-Faktor je Fenster (Lupe ± in der Fenster-Kopfleiste). */
export const EXPERIMENT_ZOOM_VIEW_KEY = 'paket.view.experiment.zoom';
/**
 * DA.M.B: Saved View der EINGEBETTETEN Digitalen Ablagen — eigener
 * Key, damit DA.M.B den Basis-Tab /ablagen nicht umkonfiguriert.
 */
export const EXPERIMENT_ABLAGEN_VIEW_KEY = 'paket.view.experiment.ablagen';
/**
 * DA.M.B: Vorverteilung (Rückseite des Beleg-Fensters) — Anzahl
 * vorzubereitender Bündel + Sperr-Schalter des Zahnrad-Menüs.
 */
export const EXPERIMENT_VORVERTEILUNG_VIEW_KEY = 'paket.view.experiment.vorverteilung';

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

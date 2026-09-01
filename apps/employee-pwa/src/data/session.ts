/**
 * Persisted employee session (real login, see `data/auth.ts`).
 *
 * The token is a bearer JWT minted by `POST /api/auth/login`. We store the
 * decoded claims we need (`employeeNo`, `displayName`, `exp`) alongside the raw
 * token so the rest of the app never has to re-decode the JWT to render the
 * signed-in identity. The token itself is only ever attached as an
 * Authorization header (see `data/api.ts`) — never logged.
 *
 * JE FENSTER EINE ANMELDUNG (01.09.2026): die Sitzung lebt im `sessionStorage`,
 * den jeder Tab für sich hat. Mehrere Mitarbeitende können damit gleichzeitig in
 * verschiedenen Fenstern arbeiten — vorher teilten sich alle Tabs den einen
 * `localStorage`-Eintrag, sodass die zweite Anmeldung die erste überschrieb und
 * jede Aktion plötzlich unter dem zuletzt angemeldeten Konto lief.
 * Der `localStorage` bleibt als GERÄTE-Standard: ein frisch geöffneter Tab
 * übernimmt die zuletzt genutzte Anmeldung, statt den Anmeldebildschirm zu
 * zeigen (der Regelfall im Lager — ein Gerät, ein Mitarbeiter).
 */
const STORAGE_KEY = 'paket.session';

export interface Session {
  token: string;
  employeeNo: string;
  displayName: string;
  /** JWT `exp` claim (seconds since epoch). */
  exp: number;
}

function parse(raw: string | null): Session | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  const own = parse(sessionStorage.getItem(STORAGE_KEY));
  if (own) return own;
  // Frischer Tab: den Geräte-Standard übernehmen und ihn ab jetzt als EIGENE
  // Sitzung führen — meldet sich hier später jemand anders an, bleiben die
  // anderen Fenster bei ihrem Konto.
  const device = parse(localStorage.getItem(STORAGE_KEY));
  if (device) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(device));
  return device;
}

export function setSession(session: Session): void {
  const raw = JSON.stringify(session);
  sessionStorage.setItem(STORAGE_KEY, raw);
  localStorage.setItem(STORAGE_KEY, raw);
}

type SessionClearedListener = () => void;

/**
 * Subscribers notified whenever the session is cleared (logout, or a 401
 * caught by `data/apiErrorHandling.ts`). `App.tsx` is the canonical subscriber:
 * it forces the session state back to `null` so the router falls back to
 * `LoginScreen`, regardless of which layer triggered the clear.
 */
const sessionClearedListeners = new Set<SessionClearedListener>();

/** Subscribe to session-cleared notifications. Returns an unsubscribe function. */
export function onSessionCleared(listener: SessionClearedListener): () => void {
  sessionClearedListeners.add(listener);
  return () => sessionClearedListeners.delete(listener);
}

export function clearSession(): void {
  const own = parse(sessionStorage.getItem(STORAGE_KEY));
  sessionStorage.removeItem(STORAGE_KEY);
  // Den Geräte-Standard nur löschen, wenn er zu DIESEM Fenster gehört: sonst
  // würde das Abmelden in einem Fenster die Vorbelegung des Kollegen mitnehmen.
  const device = parse(localStorage.getItem(STORAGE_KEY));
  if (!own || !device || device.employeeNo === own.employeeNo) {
    localStorage.removeItem(STORAGE_KEY);
  }
  sessionClearedListeners.forEach((listener) => listener());
}

export function isSessionExpired(session: Session): boolean {
  return session.exp * 1000 <= Date.now();
}

/**
 * Persisted employee session (real login, see `data/auth.ts`).
 *
 * The token is a bearer JWT minted by `POST /api/auth/login`. We store the
 * decoded claims we need (`employeeNo`, `displayName`, `exp`) alongside the raw
 * token so the rest of the app never has to re-decode the JWT to render the
 * signed-in identity. The token itself is only ever attached as an
 * Authorization header (see `data/api.ts`) — never logged.
 */
const STORAGE_KEY = 'paket.session';

export interface Session {
  token: string;
  employeeNo: string;
  displayName: string;
  /** JWT `exp` claim (seconds since epoch). */
  exp: number;
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function setSession(session: Session): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function isSessionExpired(session: Session): boolean {
  return session.exp * 1000 <= Date.now();
}

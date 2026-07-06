/**
 * A2 Tisch-Anmeldung: the worker identifies their Arbeitsplatz (Tisch) once —
 * typed Tisch-Nr. or scanned barcode. The choice is persisted locally and, in
 * backend mode, claimed via POST /api/me/workstation so the assignment side
 * knows the real per-employee Arbeitsplatz. 'Arbeitsplatz: Tisch X' everywhere
 * reflects this claim, never demo data.
 */
import { getApiClient, isBackendEnabled } from './api.js';

const WORKSTATION_KEY = 'paket.workstation';

export interface WorkstationClaim {
  code: string;
  name: string;
}

/** The locally persisted Arbeitsplatz claim, or undefined when not yet logged in. */
export function getWorkstation(): WorkstationClaim | undefined {
  try {
    const raw = localStorage.getItem(WORKSTATION_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as Partial<WorkstationClaim>;
    if (typeof parsed.code !== 'string' || parsed.code.length === 0) return undefined;
    return { code: parsed.code, name: typeof parsed.name === 'string' ? parsed.name : parsed.code };
  } catch {
    return undefined;
  }
}

export function setWorkstation(claim: WorkstationClaim): void {
  try {
    localStorage.setItem(WORKSTATION_KEY, JSON.stringify(claim));
  } catch {
    // Non-fatal: the claim simply won't persist across reloads.
  }
}

export function clearWorkstation(): void {
  try {
    localStorage.removeItem(WORKSTATION_KEY);
  } catch {
    // Non-fatal.
  }
}

/**
 * Claim the Arbeitsplatz. Backend mode validates the code server-side (404 for
 * an unknown Tisch) and persists User.workstationId; offline the code itself is
 * the claim. Returns the stored claim.
 */
export async function claimWorkstation(code: string): Promise<WorkstationClaim> {
  const trimmed = code.trim();
  if (!isBackendEnabled) {
    const claim = { code: trimmed, name: trimmed };
    setWorkstation(claim);
    return claim;
  }
  const { data, error } = await getApiClient().POST('/api/me/workstation', {
    body: { code: trimmed },
  });
  if (error || !data) {
    throw new Error(`Tisch „${trimmed}“ nicht gefunden`);
  }
  const claim = { code: data.code, name: data.name };
  setWorkstation(claim);
  return claim;
}

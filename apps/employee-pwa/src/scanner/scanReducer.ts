/**
 * Pure keyboard-wedge scan reducer (§12.4: "Scanner können im MVP als
 * Tastatureingabe verwendet werden"). A hardware scanner emits characters in a
 * tight burst terminated by Enter; a human types slowly. We distinguish them by
 * inter-key timing and only emit a scan on the terminator.
 *
 * Kept pure so the <300–500 ms feedback path (§E.5) is unit-testable without DOM.
 */

export interface ScanState {
  buffer: string;
  /** Timestamp of the last accepted key, 0 when idle. */
  lastTime: number;
}

export interface ScanKey {
  key: string;
  time: number;
}

export interface ScanConfig {
  /** Max gap between scanner keystrokes; larger gaps reset the buffer. */
  maxInterKeyMs: number;
  /** Minimum length for a burst to count as a scan. */
  minLength: number;
}

export const defaultScanConfig: ScanConfig = { maxInterKeyMs: 50, minLength: 3 };

export const emptyScanState: ScanState = { buffer: '', lastTime: 0 };

export interface ScanFeedResult {
  state: ScanState;
  /** Non-null when a complete code was recognised on this key. */
  scan: string | null;
}

/**
 * Feed a single key event. Returns the next state and, on a terminator, the
 * recognised code (or null if the burst was too short / too slow to trust).
 */
export function feedKey(
  state: ScanState,
  event: ScanKey,
  config: ScanConfig = defaultScanConfig,
): ScanFeedResult {
  const gap = event.time - state.lastTime;
  const tooSlow = state.lastTime !== 0 && gap > config.maxInterKeyMs;
  const base = tooSlow ? '' : state.buffer;

  if (event.key === 'Enter') {
    const code = base;
    const accepted = code.length >= config.minLength ? code : null;
    return { state: emptyScanState, scan: accepted };
  }

  // Printable single characters extend the burst; control keys only bump time.
  if (event.key.length === 1) {
    return { state: { buffer: base + event.key, lastTime: event.time }, scan: null };
  }

  return { state: { buffer: base, lastTime: event.time }, scan: null };
}

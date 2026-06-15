/**
 * Keyboard-wedge scanner hook. Listens for global keydown bursts and emits a
 * code through the pure scanReducer. Local feedback is immediate (<300–500 ms,
 * §E.5) because recognition happens synchronously on the terminator key.
 */
import { useEffect, useRef } from 'react';
import { defaultScanConfig, emptyScanState, feedKey, type ScanConfig } from './scanReducer.js';

export interface UseScannerOptions {
  onScan: (code: string) => void;
  enabled?: boolean;
  config?: ScanConfig;
}

export function useScanner({
  onScan,
  enabled = true,
  config = defaultScanConfig,
}: UseScannerOptions): void {
  const stateRef = useRef(emptyScanState);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    stateRef.current = emptyScanState;

    function handleKey(event: KeyboardEvent): void {
      const result = feedKey(stateRef.current, { key: event.key, time: event.timeStamp }, config);
      stateRef.current = result.state;
      if (result.scan) {
        onScanRef.current(result.scan);
      }
    }

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [enabled, config]);
}

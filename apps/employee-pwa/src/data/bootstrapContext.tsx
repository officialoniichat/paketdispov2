/**
 * Bootstrap status shared from App down to the Tagesstart screen, so the
 * first screen can show a loading skeleton while loadAssignedWork() runs and
 * surface a non-fatal load error.
 */
import { createContext, useContext, type JSX, type ReactNode } from 'react';

export interface BootstrapState {
  /** True while the backend bundle is being fetched into Dexie. */
  loading: boolean;
  /** Non-fatal load error message, if the initial fetch failed. */
  error?: string;
}

const BootstrapContext = createContext<BootstrapState>({ loading: false });

export function BootstrapProvider({
  value,
  children,
}: {
  value: BootstrapState;
  children: ReactNode;
}): JSX.Element {
  return <BootstrapContext.Provider value={value}>{children}</BootstrapContext.Provider>;
}

export function useBootstrap(): BootstrapState {
  return useContext(BootstrapContext);
}

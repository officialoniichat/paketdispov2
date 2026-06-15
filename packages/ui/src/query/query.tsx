/**
 * TanStack Query setup (§12.2: TanStack Query for both surfaces).
 *
 * Warehouse-tuned defaults: data is treated as fresh for a short window, focus
 * refetch is off (kiosk/handheld usage), and failed reads retry twice. Apps get
 * a one-line bootstrap via {@link AppProviders} (theme + query together).
 */
import type { JSX, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LtThemeProvider } from '../theme/LtThemeProvider.js';

export interface QueryClientOverrides {
  staleTimeMs?: number;
  retry?: number;
}

/** Create a QueryClient with the shared warehouse defaults. */
export function createQueryClient(overrides: QueryClientOverrides = {}): QueryClient {
  const { staleTimeMs = 30_000, retry = 2 } = overrides;
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: staleTimeMs,
        retry,
        refetchOnWindowFocus: false,
      },
      mutations: { retry: 0 },
    },
  });
}

export interface QueryProviderProps {
  children: ReactNode;
  /** Inject a shared client (e.g. for tests); otherwise one is created. */
  client?: QueryClient;
}

/** Provides a QueryClient to the tree. */
export function QueryProvider({ children, client }: QueryProviderProps): JSX.Element {
  const queryClient = client ?? createQueryClient();
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

export interface AppProvidersProps {
  children: ReactNode;
  queryClient?: QueryClient;
}

/** Single app-root provider: L&T theme + TanStack Query. */
export function AppProviders({ children, queryClient }: AppProvidersProps): JSX.Element {
  return (
    <LtThemeProvider>
      <QueryProvider client={queryClient}>{children}</QueryProvider>
    </LtThemeProvider>
  );
}

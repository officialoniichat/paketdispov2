/**
 * Mitarbeiter-App router shell. Gates on the Tisch-Anmeldung (A2), bootstraps
 * the local store once — from the backend when VITE_API_BASE_URL is set
 * (loadAssignedWork), otherwise from the offline-demo seed — and routes the
 * one-screen bundle flow: hub (Ware holen + Bearbeiten) → Beleg → problem.
 * Navigation is flat (§E.6); back-navigation lives in the screens. The bundle
 * is re-fetched on focus (notification integration point).
 */
import { useEffect, useState, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Box from '@mui/material/Box';
import { AppHeader } from './components/AppHeader.js';
import { seedIfEmpty } from './db/seed.js';
import { loadAssignedWork } from './db/sync.js';
import { isBackendEnabled } from './data/api.js';
import { useFocusRefresh } from './data/useFocusRefresh.js';
import { BootstrapProvider } from './data/bootstrapContext.js';
import { getWorkstation, type WorkstationClaim } from './data/workstation.js';
import { BundleHomeScreen } from './screens/BundleHomeScreen.js';
import { BelegProcessScreen } from './screens/BelegProcessScreen.js';
import { ProblemMeldenScreen } from './screens/ProblemMeldenScreen.js';
import { TischLoginScreen } from './screens/TischLoginScreen.js';

export function App(): JSX.Element {
  // A2: no work without a claimed Arbeitsplatz — the Tisch login gates the app.
  const [workstation, setWorkstation] = useState<WorkstationClaim | undefined>(() =>
    getWorkstation(),
  );
  // Backend mode loads the engine-assigned bundle; demo mode seeds the example.
  const [loading, setLoading] = useState<boolean>(isBackendEnabled);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!workstation) return;
    let cancelled = false;
    async function bootstrap(): Promise<void> {
      if (!isBackendEnabled) {
        await seedIfEmpty();
        return;
      }
      setLoading(true);
      try {
        await loadAssignedWork();
        if (!cancelled) setError(undefined);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Laden fehlgeschlagen');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [workstation]);

  // Notification integration point: re-fetch the bundle when the app regains focus.
  useFocusRefresh();

  return (
    <BootstrapProvider value={{ loading, error }}>
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
        <AppHeader />
        {!workstation ? (
          <TischLoginScreen onClaimed={setWorkstation} />
        ) : (
          <Routes>
            <Route path="/" element={<BundleHomeScreen />} />
            <Route path="/case/:caseId" element={<BelegProcessScreen />} />
            <Route path="/case/:caseId/problem" element={<ProblemMeldenScreen />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </Box>
    </BootstrapProvider>
  );
}

/**
 * Mitarbeiter-App router shell. Bootstraps the local store once — from the
 * backend when VITE_API_BASE_URL is set (loadAssignedWork), otherwise from the
 * offline-demo seed — and routes the task-first screens (§9.2–9.9). Navigation
 * is flat (§E.6): bundle → case steps → problem, no deep menus.
 */
import { useEffect, useState, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Box from '@mui/material/Box';
import { AppHeader } from './components/AppHeader.js';
import { seedIfEmpty } from './db/seed.js';
import { loadAssignedWork } from './db/sync.js';
import { isBackendEnabled } from './data/api.js';
import { BootstrapProvider } from './data/bootstrapContext.js';
import { BelegListeScreen } from './screens/BelegListeScreen.js';
import { LagerplatzScanScreen } from './screens/LagerplatzScanScreen.js';
import { VorbereitungScreen } from './screens/VorbereitungScreen.js';
import { PositionScreen } from './screens/PositionScreen.js';
import { BoxenSortierenScreen } from './screens/BoxenSortierenScreen.js';
import { BoxabschlussScreen } from './screens/BoxabschlussScreen.js';
import { AbschlussScreen } from './screens/AbschlussScreen.js';
import { ProblemMeldenScreen } from './screens/ProblemMeldenScreen.js';

export function App(): JSX.Element {
  // Backend mode loads the engine-assigned bundle; demo mode seeds the example.
  const [loading, setLoading] = useState<boolean>(isBackendEnabled);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
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
  }, []);

  return (
    <BootstrapProvider value={{ loading, error }}>
      <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
        <AppHeader />
        <Routes>
        <Route path="/" element={<BelegListeScreen />} />
        <Route path="/case/:caseId/pickup" element={<LagerplatzScanScreen />} />
        <Route path="/case/:caseId/prepare" element={<VorbereitungScreen />} />
        <Route path="/case/:caseId/positions" element={<PositionScreen />} />
        <Route path="/case/:caseId/sort" element={<BoxenSortierenScreen />} />
        <Route path="/case/:caseId/boxing" element={<BoxabschlussScreen />} />
        <Route path="/case/:caseId/complete" element={<AbschlussScreen />} />
        <Route path="/case/:caseId/problem" element={<ProblemMeldenScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Box>
    </BootstrapProvider>
  );
}

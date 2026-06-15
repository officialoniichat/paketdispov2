/**
 * Mitarbeiter-App router shell. Seeds the offline package once, shows the sticky
 * Sync-Banner and routes the task-first screens (§9.2–9.9). Navigation is flat
 * (§E.6): bundle → case steps → problem, no deep menus.
 */
import { useEffect, type JSX } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Box from '@mui/material/Box';
import { SyncBanner } from './components/SyncBanner.js';
import { seedIfEmpty } from './db/seed.js';
import { TagesstartScreen } from './screens/TagesstartScreen.js';
import { PaketReihenfolgeScreen } from './screens/PaketReihenfolgeScreen.js';
import { LagerplatzScanScreen } from './screens/LagerplatzScanScreen.js';
import { VorbereitungScreen } from './screens/VorbereitungScreen.js';
import { PositionScreen } from './screens/PositionScreen.js';
import { BoxabschlussScreen } from './screens/BoxabschlussScreen.js';
import { AbschlussScreen } from './screens/AbschlussScreen.js';
import { ProblemMeldenScreen } from './screens/ProblemMeldenScreen.js';

export function App(): JSX.Element {
  useEffect(() => {
    void seedIfEmpty();
  }, []);

  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: 'background.default' }}>
      <SyncBanner />
      <Routes>
        <Route path="/" element={<TagesstartScreen />} />
        <Route path="/paket" element={<PaketReihenfolgeScreen />} />
        <Route path="/case/:caseId/pickup" element={<LagerplatzScanScreen />} />
        <Route path="/case/:caseId/prepare" element={<VorbereitungScreen />} />
        <Route path="/case/:caseId/positions" element={<PositionScreen />} />
        <Route path="/case/:caseId/boxing" element={<BoxabschlussScreen />} />
        <Route path="/case/:caseId/complete" element={<AbschlussScreen />} />
        <Route path="/case/:caseId/problem" element={<ProblemMeldenScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Box>
  );
}

/**
 * Teamlead cockpit app root: routing + the cockpit data store. The shared
 * theme/query providers are applied one level up in main.tsx (AppProviders).
 */
import type { JSX } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { CockpitDataProvider } from './data/store.js';
import { SplitProvider } from './features/split/SplitProvider.js';
import { AppShell } from './components/AppShell.js';
import { CockpitPage } from './features/cockpit/CockpitPage.js';
import { AblagenBoard } from './features/ablagen/AblagenBoard.js';
import { MitarbeiterBoard } from './features/board/MitarbeiterBoard.js';
import { BelegListPage } from './features/belege/BelegListPage.js';
import { BelegDetailPage } from './features/belege/BelegDetailPage.js';
import { AufteilungenPage } from './features/split/AufteilungenPage.js';
import { AdminPage } from './features/admin/AdminPage.js';

export function App(): JSX.Element {
  return (
    <CockpitDataProvider>
      <SplitProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<CockpitPage />} />
              <Route path="ablagen" element={<AblagenBoard />} />
              <Route path="board" element={<MitarbeiterBoard />} />
              <Route path="belege" element={<BelegListPage />} />
              <Route path="belege/:caseId" element={<BelegDetailPage />} />
              <Route path="aufteilungen" element={<AufteilungenPage />} />
              <Route path="admin" element={<AdminPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SplitProvider>
    </CockpitDataProvider>
  );
}

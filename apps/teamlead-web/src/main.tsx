import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@paket/ui';
import { App } from './App.js';
import { queryClient } from './data/queryClient.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders queryClient={queryClient}>
      <App />
    </AppProviders>
  </StrictMode>,
);

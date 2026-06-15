import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@paket/ui';
import { App } from './App.js';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
);

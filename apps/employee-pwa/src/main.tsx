import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { AppProviders } from '@paket/ui';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App.js';
import { queryClient } from './data/queryClient.js';

// Workbox service worker (vite-plugin-pwa). autoUpdate handles new versions.
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </AppProviders>
  </StrictMode>,
);

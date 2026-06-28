import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Mobile-first PWA: Workbox precache for offline shell + installable manifest.
// The offline *data* package lives in IndexedDB (Dexie); Workbox covers the app
// shell so the current package stays usable without network (§12.4, §E.5).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'L&T Warenauszeichnung',
        short_name: 'Warenausz.',
        description: 'Mitarbeiter-App für die digitale Belegverteilung',
        lang: 'de',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0a3d62',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // /env.js carries runtime config regenerated on each deploy. Never precache it
        // (Workbox would serve the stale build-time placeholder) or let the SPA
        // navigation fallback swallow it — keep it a plain network fetch.
        globIgnores: ['**/env.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/env\.js$/],
      },
      devOptions: { enabled: false },
    }),
  ],
  // Serve on 0.0.0.0 and accept the reverse-proxy host (e.g. *.up.railway.app) so
  // the deployed app responds. Port comes from the dev/preview scripts (5175),
  // which matches the platform's routed target port.
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
});

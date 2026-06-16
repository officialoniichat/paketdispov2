import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Serve on 0.0.0.0 and accept the reverse-proxy host (e.g. *.up.railway.app) so
  // the deployed app responds. Port comes from the dev/preview scripts (5174),
  // which matches the platform's routed target port.
  server: { host: true, allowedHosts: true },
  preview: { host: true, allowedHosts: true },
});

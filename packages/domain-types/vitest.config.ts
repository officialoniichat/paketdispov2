import { defineConfig } from 'vitest/config';

// Eigene (leere) Vitest-Config: beendet Vitests Config-Aufwärtssuche in diesem
// Package. Ohne sie läuft die Suche über die Repo-Grenze hinaus und kann eine
// fremde vite.config.js aus einem Eltern-Verzeichnis des Checkouts laden
// (z. B. ~/Documents), die die Transform-Pipeline verbiegt — .ts wird dann
// nicht mehr als TypeScript transformiert. Leer = reine Vitest-Defaults.
export default defineConfig({ test: {} });

// Runtime configuration placeholder (local dev + build fallback).
//
// In production this file is REGENERATED at container start from the Railway
// environment by scripts/write-runtime-env.mjs, then served as /env.js BEFORE the
// app bundle (see index.html). Keeping it an empty object here means local dev and
// any unset variable fall back to import.meta.env (build-time) and then localhost.
//
// This file is excluded from the Workbox precache (vite.config.ts globIgnores) so
// the service worker never serves a stale build-time copy. Do not put secrets here
// that should not reach the browser — /env.js is public, like Vite's VITE_* vars.
window.__ENV__ = {};

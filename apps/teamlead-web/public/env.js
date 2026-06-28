// Runtime configuration placeholder (local dev + build fallback).
//
// In production this file is REGENERATED at container start from the Railway
// environment by scripts/write-runtime-env.mjs, then served as /env.js BEFORE the
// app bundle (see index.html). Keeping it an empty object here means local dev and
// any unset variable fall back to import.meta.env (build-time) and then localhost.
//
// Do not put secrets here that should not reach the browser — /env.js is public,
// exactly like Vite's VITE_* variables.
window.__ENV__ = {};

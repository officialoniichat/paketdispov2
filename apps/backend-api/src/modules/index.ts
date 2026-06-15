/**
 * Fachliche Modulgrenzen des modularen Monolithen (§12.3).
 * The backbone (this EPIC) implements auth, workflow, events, and the case
 * pool/lifecycle; the remaining boundaries are filled by EPIC 3+. Keeping the
 * canonical list here makes the boundaries explicit from day one and lets the
 * readiness probe report them.
 */
export const DOMAIN_MODULES = [
  'document',
  'workflow',
  'assignment',
  'route',
  'issue',
  'print',
  'reporting',
  'admin',
] as const;

export type DomainModule = (typeof DOMAIN_MODULES)[number];

/**
 * ProHandel-Integration — UI mock data layer.
 *
 * This is a deliberate MOCK (no live ProHandel endpoint yet): it backs the
 * Admin „Integrationen"-Tab so the settings UX can be reviewed end-to-end before
 * the real delta-pull exists. Concept: `docs/concept/prohandel-integration-concept.md`.
 *
 * Secrets are NEVER part of the config payload — the API key lives only in an
 * environment variable; the UI just reflects whether it is present.
 */

/** Connection settings the admin edits. Secret is intentionally absent. */
export interface ProhandelConfig {
  enabled: boolean;
  baseUrl: string;
  /** Selected Mandant/Filiale numbers (e.g. ['01', '04']). */
  branchScope: string[];
  pollIntervalSeconds: number;
  /** Read-only: reflects presence of the ENV secret, never its value. */
  secretConfigured: boolean;
  secretEnvVar: string;
}

/** Live poller status (read-only). */
export interface ProhandelSyncStatus {
  connected: boolean;
  lastPullAt: string;
  lastPullOk: boolean;
  cursorLabel: string;
  newCases: number;
  nextPullInSeconds: number;
}

/** A booking that failed the anti-corruption mapper — held, never dropped. */
export interface QuarantineItem {
  weBelegNo: string;
  reason: string;
}

export interface BranchOption {
  no: string;
  name: string;
}

export interface ProhandelIntegration {
  config: ProhandelConfig;
  status: ProhandelSyncStatus;
  quarantine: QuarantineItem[];
  branches: BranchOption[];
}

export const PROHANDEL_INTEGRATION_QUERY_KEY = ['admin', 'integrations', 'prohandel'] as const;

const BRANCHES: BranchOption[] = [
  { no: '01', name: 'Osnabrück' },
  { no: '04', name: 'Bielefeld' },
  { no: '07', name: 'Münster' },
];

/** In-memory mock state so save/retry/pull feel real across a session. */
let state: ProhandelIntegration = {
  config: {
    enabled: true,
    baseUrl: 'https://erp.example.de/prohandel/api/v2',
    branchScope: ['01', '04'],
    pollIntervalSeconds: 180,
    secretConfigured: true,
    secretEnvVar: 'PROHANDEL_API_KEY',
  },
  status: {
    connected: true,
    lastPullAt: '12:48:07',
    lastPullOk: true,
    cursorLabel: 'Buchung #88421',
    newCases: 7,
    nextPullInSeconds: 134,
  },
  quarantine: [
    { weBelegNo: 'WE-2026-000139', reason: 'Mapping-Fehler: WGR fehlt' },
    { weBelegNo: 'WE-2026-000140', reason: 'Lieferant unbekannt' },
  ],
  branches: BRANCHES,
};

function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function snapshot(): ProhandelIntegration {
  return {
    config: { ...state.config, branchScope: [...state.config.branchScope] },
    status: { ...state.status },
    quarantine: state.quarantine.map((q) => ({ ...q })),
    branches: state.branches.map((b) => ({ ...b })),
  };
}

export function fetchProhandelIntegration(): Promise<ProhandelIntegration> {
  return delay(snapshot());
}

export function saveProhandelConfig(config: ProhandelConfig): Promise<ProhandelIntegration> {
  // Secret is never written from the UI; preserve the ENV-derived flags.
  state = {
    ...state,
    config: {
      ...config,
      secretConfigured: state.config.secretConfigured,
      secretEnvVar: state.config.secretEnvVar,
    },
  };
  return delay(snapshot(), 400);
}

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
}

export function testProhandelConnection(): Promise<ConnectionTestResult> {
  const visible = state.config.branchScope.length;
  return delay({
    ok: state.config.secretConfigured && state.config.baseUrl.length > 0,
    message: `API v2 erreichbar · ${visible} Filiale${visible === 1 ? '' : 'n'} sichtbar · 240 ms`,
  });
}

export function retryQuarantineItem(weBelegNo: string): Promise<ProhandelIntegration> {
  state = {
    ...state,
    quarantine: state.quarantine.filter((q) => q.weBelegNo !== weBelegNo),
  };
  return delay(snapshot(), 300);
}

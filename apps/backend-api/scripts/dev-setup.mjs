/**
 * Idempotent local dev setup: writes the three gitignored `.env` files with a
 * single consistent RS256 keypair and 30-day dev tokens, so a fresh checkout /
 * worktree can talk to the backend without an identity provider.
 *
 * Run: `pnpm dev:setup` (from repo root) or
 *      `pnpm --filter @paket/backend-api exec node scripts/dev-setup.mjs`
 *
 * Re-running REUSES the existing backend keypair (if present) so previously
 * issued tokens stay valid; it only mints fresh tokens + rewrites the frontend
 * `.env` files. Nothing here is committed (all three `.env` are gitignored).
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { importPKCS8, SignJWT } from 'jose';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BACKEND_ENV = resolve(ROOT, 'apps/backend-api/.env');
const TEAMLEAD_ENV = resolve(ROOT, 'apps/teamlead-web/.env');
const EMPLOYEE_ENV = resolve(ROOT, 'apps/employee-pwa/.env');
const API_BASE_URL = process.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/** Read a `KEY="..."` (possibly multiline, double-quoted) value from a .env string. */
function readQuoted(envText, key) {
  const m = envText.match(new RegExp(`${key}="([\\s\\S]*?)"`, 'm'));
  return m ? m[1] : undefined;
}

function loadOrCreateKeypair() {
  if (existsSync(BACKEND_ENV)) {
    const text = readFileSync(BACKEND_ENV, 'utf8');
    const publicKey = readQuoted(text, 'AUTH_DEV_PUBLIC_KEY');
    const privateKey = readQuoted(text, 'AUTH_DEV_PRIVATE_KEY');
    if (publicKey && privateKey) {
      return { publicKey, privateKey, reused: true };
    }
  }
  const pair = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey: pair.publicKey.trim(), privateKey: pair.privateKey.trim(), reused: false };
}

function buildBackendEnv(publicKey, privateKey) {
  let base = readFileSync(resolve(ROOT, '.env.example'), 'utf8');
  if (!base.endsWith('\n')) base += '\n';
  base += '\n# --- dev auth + swagger (local only, gitignored) ---\n';
  base += 'SWAGGER_ENABLED=false\n';
  base += `AUTH_DEV_PUBLIC_KEY="${publicKey}"\n`;
  base += `AUTH_DEV_PRIVATE_KEY="${privateKey}"\n`;
  return base;
}

async function mint(privateKeyPem, employeeNo, role, name) {
  const key = await importPKCS8(privateKeyPem, 'RS256');
  return new SignJWT({ employee_no: employeeNo, realm_access: { roles: [role] }, name })
    .setProtectedHeader({ alg: 'RS256' })
    .setSubject(`dev:${employeeNo}`)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(key);
}

const { publicKey, privateKey, reused } = loadOrCreateKeypair();

// Only (re)write the backend .env when the keypair was freshly created, so an
// existing, working backend .env (with the running server's key) is preserved.
if (!reused) {
  mkdirSync(dirname(BACKEND_ENV), { recursive: true });
  writeFileSync(BACKEND_ENV, buildBackendEnv(publicKey, privateKey));
}

const teamleadToken = await mint(privateKey, 'tl-001', 'teamlead', 'Teamlead');
const employeeToken = await mint(privateKey, 'ma-101', 'employee', 'Mitarbeiter 101');
// Admin token for the dev-gated /api/dev surface (Dev-Panel "Dev / Szenarien"):
// the cockpit keeps acting as the Teamlead everywhere else and uses this token
// ONLY for /api/dev/* (see apps/teamlead-web/src/data/dev.ts). Backend roles
// stay strict — /api/dev remains @Roles(Admin) + DEV_PANEL env gate.
const adminToken = await mint(privateKey, 'admin-001', 'admin', 'Admin (Dev-Panel)');

writeFileSync(
  TEAMLEAD_ENV,
  `VITE_API_BASE_URL=${API_BASE_URL}\nVITE_DEV_TOKEN=${teamleadToken}\nVITE_DEV_ADMIN_TOKEN=${adminToken}\n`,
);
writeFileSync(EMPLOYEE_ENV, `VITE_API_BASE_URL=${API_BASE_URL}\nVITE_DEV_TOKEN=${employeeToken}\n`);

console.log(`[dev-setup] backend .env: ${reused ? 'kept existing keypair' : 'created new keypair'}`);
console.log('[dev-setup] wrote apps/teamlead-web/.env (+ admin dev-panel token) + apps/employee-pwa/.env (30d dev tokens)');
console.log('[dev-setup] If the backend was already running, restart it so it loads the key.');

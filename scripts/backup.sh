#!/bin/sh
# ============================================================================
# backup.sh — lean on-prem backup for Paketlagerdispo (concept §16.3)
#
# Backs up the two systems of record on the single-box deploy:
#   1. PostgreSQL  -> pg_dump custom format (-Fc), timestamped
#   2. MinIO bucket (documents/photos) -> mirrored copy via `mc mirror`
#
# Output goes to ./backups/ (gitignored). Run manually or from cron:
#   DB daily, document store regularly — see docs/operations.md.
#
# This is a TOOL, not an ERP: there is no Notmodus / paper-fallback subsystem.
# Operational continuity = these backups + the compose restart policies.
#
# Usage:
#   sh scripts/backup.sh
#
# Config: read from .env in the repo root (same vars the app uses).
# Override the env file with:  ENV_FILE=/path/to/.env sh scripts/backup.sh
# ============================================================================

set -eu
# Enable pipefail when the shell supports it (dash/ash do; POSIX sh may not).
# shellcheck disable=SC3040
(set -o pipefail) 2>/dev/null && set -o pipefail

# --- Resolve repo root (script lives in <root>/scripts) ---------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Load .env --------------------------------------------------------------
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
if [ -f "${ENV_FILE}" ]; then
  # Export every assignment in .env into the environment.
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
else
  echo "[backup] WARN: ${ENV_FILE} not found — relying on existing environment." >&2
fi

# --- Defaults (mirror docker-compose.yml / .env.example) --------------------
POSTGRES_USER="${POSTGRES_USER:-paket}"
POSTGRES_DB="${POSTGRES_DB:-paketlager}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"

MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost}"
MINIO_PORT="${MINIO_PORT:-9000}"
MINIO_ROOT_USER="${MINIO_ROOT_USER:-paketminio}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-paketminio_dev_pw}"
MINIO_BUCKET="${MINIO_BUCKET:-documents}"
MINIO_USE_SSL="${MINIO_USE_SSL:-false}"

BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"

# --- Timestamp: YYYYMMDD_HHMMSS ---------------------------------------------
TS="$(date +%Y%m%d_%H%M%S)"

DB_DUMP="${BACKUP_DIR}/paketlager_db_${TS}.dump"
DOCS_DIR="${BACKUP_DIR}/paketlager_docs_${TS}"

mkdir -p "${BACKUP_DIR}"

echo "[backup] Target dir : ${BACKUP_DIR}"
echo "[backup] Timestamp  : ${TS}"

# ----------------------------------------------------------------------------
# 1. PostgreSQL dump (custom format -> restorable with pg_restore)
# ----------------------------------------------------------------------------
echo "[backup] Dumping Postgres ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT} ..."
# PGPASSWORD is read by pg_dump; passed via env so it never lands in argv.
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_dump \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --format=custom \
  --no-owner \
  --file="${DB_DUMP}"
echo "[backup] DB dump written: ${DB_DUMP}"

# ----------------------------------------------------------------------------
# 2. MinIO document store mirror
# ----------------------------------------------------------------------------
if command -v mc >/dev/null 2>&1; then
  if [ "${MINIO_USE_SSL}" = "true" ]; then
    MINIO_URL="https://${MINIO_ENDPOINT}:${MINIO_PORT}"
  else
    MINIO_URL="http://${MINIO_ENDPOINT}:${MINIO_PORT}"
  fi
  echo "[backup] Mirroring MinIO bucket '${MINIO_BUCKET}' from ${MINIO_URL} ..."
  mc alias set paketbackup "${MINIO_URL}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
  mkdir -p "${DOCS_DIR}"
  mc mirror --overwrite "paketbackup/${MINIO_BUCKET}" "${DOCS_DIR}"
  echo "[backup] Document store mirrored: ${DOCS_DIR}"
else
  echo "[backup] WARN: MinIO client 'mc' not found — skipping document store." >&2
  echo "[backup]       Install mc, or mirror from a container (see docs/operations.md)." >&2
fi

echo "[backup] DONE. Verify with: pg_restore --list \"${DB_DUMP}\" | head"

#!/bin/sh
# ============================================================================
# restore.sh — lean on-prem restore for Paketlagerdispo (concept §16.3)
#
# Restores from artifacts produced by scripts/backup.sh:
#   1. PostgreSQL  <- pg_restore of a custom-format dump (DESTRUCTIVE)
#   2. MinIO bucket (documents/photos) <- mc mirror of a docs dir
#
# DESTRUCTIVE: the DB restore drops and recreates objects in the target DB.
# A confirmation prompt is required unless FORCE=1 is set.
#
# Use this in the mandatory RESTORE-TEST before go-live (see docs/operations.md):
# restore into a throwaway DB, verify row counts, then tear it down.
#
# Usage:
#   sh scripts/restore.sh backups/paketlager_db_YYYYMMDD_HHMMSS.dump \
#                        [backups/paketlager_docs_YYYYMMDD_HHMMSS]
#
# Restore into a safe scratch DB instead of the live one:
#   POSTGRES_DB=paketlager_restoretest sh scripts/restore.sh <dump>
#
# Skip the prompt (e.g. automated restore-test):
#   FORCE=1 sh scripts/restore.sh <dump>
#
# Config: read from .env (override with ENV_FILE=/path/to/.env).
# ============================================================================

set -eu
# shellcheck disable=SC3040
(set -o pipefail) 2>/dev/null && set -o pipefail

# --- Args -------------------------------------------------------------------
DB_DUMP="${1:-}"
DOCS_DIR="${2:-}"

if [ -z "${DB_DUMP}" ]; then
  echo "Usage: sh scripts/restore.sh <db.dump> [docs_dir]" >&2
  exit 2
fi
if [ ! -f "${DB_DUMP}" ]; then
  echo "[restore] ERROR: DB dump not found: ${DB_DUMP}" >&2
  exit 1
fi

# --- Resolve repo root ------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Load .env --------------------------------------------------------------
ENV_FILE="${ENV_FILE:-${ROOT_DIR}/.env}"
if [ -f "${ENV_FILE}" ]; then
  set -a
  # shellcheck disable=SC1090
  . "${ENV_FILE}"
  set +a
else
  echo "[restore] WARN: ${ENV_FILE} not found — relying on existing environment." >&2
fi

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

# --- Safety confirmation ----------------------------------------------------
echo "[restore] About to restore into:"
echo "           DB     : ${POSTGRES_DB}@${POSTGRES_HOST}:${POSTGRES_PORT}"
echo "           Bucket : ${MINIO_BUCKET}@${MINIO_ENDPOINT}:${MINIO_PORT}"
echo "           From   : ${DB_DUMP}"
[ -n "${DOCS_DIR}" ] && echo "           Docs   : ${DOCS_DIR}"
echo "[restore] This DROPS AND RECREATES objects in '${POSTGRES_DB}'."

if [ "${FORCE:-0}" != "1" ]; then
  printf "[restore] Type 'yes' to continue: "
  read -r CONFIRM
  if [ "${CONFIRM}" != "yes" ]; then
    echo "[restore] Aborted." >&2
    exit 1
  fi
fi

# ----------------------------------------------------------------------------
# 1. PostgreSQL restore (custom format dump)
# ----------------------------------------------------------------------------
echo "[restore] Restoring Postgres ${POSTGRES_DB} ..."
# --clean --if-exists drops existing objects first so the restore is repeatable.
PGPASSWORD="${POSTGRES_PASSWORD:-}" pg_restore \
  --host="${POSTGRES_HOST}" \
  --port="${POSTGRES_PORT}" \
  --username="${POSTGRES_USER}" \
  --dbname="${POSTGRES_DB}" \
  --clean \
  --if-exists \
  --no-owner \
  "${DB_DUMP}"
echo "[restore] DB restore complete."

# ----------------------------------------------------------------------------
# 2. MinIO document store restore
# ----------------------------------------------------------------------------
if [ -n "${DOCS_DIR}" ]; then
  if [ ! -d "${DOCS_DIR}" ]; then
    echo "[restore] ERROR: docs dir not found: ${DOCS_DIR}" >&2
    exit 1
  fi
  if command -v mc >/dev/null 2>&1; then
    if [ "${MINIO_USE_SSL}" = "true" ]; then
      MINIO_URL="https://${MINIO_ENDPOINT}:${MINIO_PORT}"
    else
      MINIO_URL="http://${MINIO_ENDPOINT}:${MINIO_PORT}"
    fi
    echo "[restore] Restoring MinIO bucket '${MINIO_BUCKET}' to ${MINIO_URL} ..."
    mc alias set paketrestore "${MINIO_URL}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" >/dev/null
    mc mb --ignore-existing "paketrestore/${MINIO_BUCKET}" >/dev/null
    mc mirror --overwrite "${DOCS_DIR}" "paketrestore/${MINIO_BUCKET}"
    echo "[restore] Document store restored."
  else
    echo "[restore] WARN: MinIO client 'mc' not found — skipping document restore." >&2
  fi
fi

echo "[restore] DONE."

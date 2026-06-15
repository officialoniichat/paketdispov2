# Operations — On-Prem Deployment & Backup/Restore (§16.3)

This is the operations runbook for the Paketlagerdispo **single-box on-prem
deployment**. It covers: deploying via Docker Compose behind the Caddy reverse
proxy, the backup schedule, and the mandatory **restore-test before go-live**.

> **This is a TOOL, not an ERP.** There is deliberately **no Notmodus /
> emergency-mode / paper-fallback subsystem**. Operational continuity is covered
> the lean way: regular **backups** (below) plus the Compose **`restart:
> unless-stopped`** policies that bring services back automatically after a
> crash or host reboot. Do not add an emergency-mode feature — it is out of
> scope for this tool.

---

## 1. On-prem deployment (Docker Compose + reverse proxy)

The stack is one `docker-compose.yml` on one VM:

| Service       | Role                                  | Volume          | Restart          |
| ------------- | ------------------------------------- | --------------- | ---------------- |
| `postgres`    | System of record (DB)                 | `postgres_data` | `unless-stopped` |
| `redis`       | BullMQ queue                          | `redis_data`    | `unless-stopped` |
| `minio`       | Document/photo store (S3)             | `minio_data`    | `unless-stopped` |
| `minio-init`  | One-shot bucket create                | —               | `no`             |
| `caddy`       | Reverse proxy (fronts API + frontend) | `caddy_*`       | `unless-stopped` |

Caddy is the single ingress. It routes `/api/*` to `backend-api:3000` and
everything else to the employee PWA (`infra/caddy/Caddyfile`). Each stateful
service has a healthcheck; Caddy waits for them to be healthy before starting
and exposes `/healthz` for its own healthcheck.

### Deploy

```sh
# 1. Configure secrets for the box (NOT committed — see .gitignore)
cp .env.example .env
#    edit .env: set strong POSTGRES_PASSWORD / MINIO_ROOT_PASSWORD,
#    set NODE_ENV=production, point hosts at the docker network where needed.

# 2. Bring up the stack
docker compose up -d

# 3. Verify everything is healthy
docker compose ps          # all services "healthy"
curl -fsS http://localhost/healthz   # -> "ok"

# 4. Apply DB schema (first deploy / after migrations)
pnpm db:migrate
```

For HTTPS, point `infra/caddy/Caddyfile` at your hostname and enable Caddy's
automatic TLS (`auto_https` is off in the pilot baseline; turn it on once a
public DNS name + ports 80/443 are reachable).

---

## 2. Backup

Two artifacts, written to `./backups/` (gitignored):

| Artifact                              | What                       | How           |
| ------------------------------------- | -------------------------- | ------------- |
| `paketlager_db_YYYYMMDD_HHMMSS.dump`  | Postgres DB                | `pg_dump -Fc` |
| `paketlager_docs_YYYYMMDD_HHMMSS/`    | MinIO document/photo store | `mc mirror`   |

The date stamp is `YYYYMMDD_HHMMSS` (e.g. `paketlager_db_20260615_023000.dump`).
Both scripts read connection settings from `.env`.

### Run a backup

```sh
sh scripts/backup.sh
```

### Schedule (§16.3: "DB täglich, Dokumentenspeicher regelmäßig")

Add to the host crontab (`crontab -e`). The script handles both DB and docs;
the document store changes less often, so a daily run of the same script
satisfies "DB daily + docs regularly" with one entry — or split if the document
store is large:

```cron
# DB + documents — daily at 02:30
30 2 * * *  cd /opt/paketlagerdispo && sh scripts/backup.sh >> /var/log/paket-backup.log 2>&1
```

**Retention:** prune old backups so the disk does not fill, e.g. keep 14 days:

```sh
find /opt/paketlagerdispo/backups -maxdepth 1 -name 'paketlager_*' -mtime +14 -exec rm -rf {} +
```

Copy `backups/` off-box (rsync / external disk) — a backup on the same VM does
not survive a disk failure.

---

## 3. Restore

`scripts/restore.sh` restores a DB dump (and optionally the document mirror).
The DB restore is **destructive** (drops + recreates objects) and prompts for
`yes` confirmation unless `FORCE=1`.

```sh
sh scripts/restore.sh backups/paketlager_db_20260615_023000.dump \
                      backups/paketlager_docs_20260615_023000
```

---

## 4. Restore-test before go-live (MANDATORY, §16.3)

A backup that has never been restored is not a backup. Run this **before
go-live**, then on a regular cadence:

1. **Take a fresh backup** of the live system:
   ```sh
   sh scripts/backup.sh
   ```
2. **Create a throwaway DB** so the live DB is never touched:
   ```sh
   docker compose exec postgres \
     psql -U "$POSTGRES_USER" -c 'CREATE DATABASE paketlager_restoretest;'
   ```
3. **Restore the dump into the scratch DB** (no prompt needed):
   ```sh
   FORCE=1 POSTGRES_DB=paketlager_restoretest \
     sh scripts/restore.sh backups/paketlager_db_YYYYMMDD_HHMMSS.dump
   ```
4. **Verify integrity** — spot-check that key tables have plausible row counts:
   ```sh
   docker compose exec postgres psql -U "$POSTGRES_USER" -d paketlager_restoretest \
     -c '\dt' -c 'SELECT count(*) FROM "Document";'
   ```
   Compare against the live DB. Counts should match the backup point-in-time.
5. **Tear down the scratch DB:**
   ```sh
   docker compose exec postgres \
     psql -U "$POSTGRES_USER" -c 'DROP DATABASE paketlager_restoretest;'
   ```
6. **Record the result** (date, backup file, row counts, pass/fail) in the
   go-live checklist.

For the document store, a restore-test can target a scratch bucket:

```sh
FORCE=1 MINIO_BUCKET=documents-restoretest \
  sh scripts/restore.sh backups/paketlager_db_YYYYMMDD_HHMMSS.dump \
                        backups/paketlager_docs_YYYYMMDD_HHMMSS
```

**Go-live gate:** do not go live until at least one full restore-test has passed
and is documented.

---

## 5. Recovery (real incident)

If the host or a service is lost:

1. The Compose `restart: unless-stopped` policy auto-restarts crashed services
   and brings the stack back after a host reboot — usually nothing to do.
2. If data is lost (disk failure), provision a fresh box, `docker compose up -d`,
   then restore the latest backup with `scripts/restore.sh` (§3) and
   `pnpm db:migrate` if newer migrations exist.

That is the entire continuity story for this tool. No separate Notmodus
subsystem exists or is needed.

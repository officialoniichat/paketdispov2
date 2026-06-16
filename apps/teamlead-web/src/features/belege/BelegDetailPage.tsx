/**
 * Belegdetails (§10.4): Kopf, Priorität, Aufwand, Positionen+SKU, Boxen,
 * Historie und Originaldokumente — read live from the backend
 * (`GET /api/teamlead/cases/:id`). Teamlead actions (Priorisieren/Parken) POST
 * through the store's audited (§8.4) endpoints and invalidate this view + the
 * cockpit on success.
 */
import { useState, type JSX, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { CaseStatusChip, PriorityChip, ProblemChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import type { CaseStatus } from '@paket/domain-types';
import {
  fetchBelegDetail,
  type BelegBox,
  type BelegDetail,
  type BelegDocument,
  type BelegHistoryEntry,
  type BelegIssue,
  type BelegPosition,
  type BelegZst,
} from '../../data/belege.js';
import { formatDate, formatDateTime, formatMinutes } from '../../lib/format.js';
import { ReasonDialog } from '../../components/ReasonDialog.js';
import { ACTOR_LABELS, formatAuditAction } from '../../data/audit.js';
import { toActorType } from '../../data/narrow.js';

const TABS = [
  'Kopf',
  'Priorität',
  'Aufwand',
  'Positionen',
  'Boxen',
  'Abschluss',
  'Problem',
  'Historie',
  'Dokumente',
];

/** Storno is only sensible before an employee has started work (the backend rejects the rest). */
const CANCELLABLE: CaseStatus[] = ['imported', 'parsed', 'needs_review', 'ready', 'parked', 'assigned'];

export function BelegDetailPage(): JSX.Element {
  const { caseId = '' } = useParams();
  const { prioritiseCase, parkCase, cancelCase, resolveIssue, releaseIssue } = useCockpitData();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  const [pending, setPending] = useState<{ title: string; run: (r: string) => void } | null>(null);

  const query = useQuery<BelegDetail, Error>({
    queryKey: ['beleg', caseId],
    queryFn: () => fetchBelegDetail(caseId),
    enabled: caseId !== '',
  });

  if (query.isLoading) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={220} height={48} />
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }

  if (query.isError) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5">Beleg konnte nicht geladen werden</Typography>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void query.refetch()}>
              Erneut laden
            </Button>
          }
        >
          {query.error.message}
        </Alert>
        <Button onClick={() => navigate('/belege')}>Zur Belegliste</Button>
      </Stack>
    );
  }

  const c = query.data;
  if (!c) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5">Beleg nicht gefunden</Typography>
        <Button onClick={() => navigate('/belege')}>Zur Belegliste</Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        flexWrap="wrap"
        gap={1}
      >
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>
            {c.weBelegNo}
          </Typography>
          <Stack direction="row" gap={0.5} flexWrap="wrap" sx={{ mt: 0.5 }}>
            <CaseStatusChip status={c.status} size="small" />
            {c.priorityFlags.map((f) => (
              <PriorityChip key={f} flag={f} size="small" />
            ))}
            {c.hasOpenIssue && <ProblemChip status="open" size="small" />}
          </Stack>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            onClick={() =>
              setPending({
                title: `Beleg ${c.weBelegNo} priorisieren`,
                run: (r) => prioritiseCase(c.id, r),
              })
            }
          >
            Priorisieren
          </Button>
          <Button
            variant="outlined"
            color="warning"
            onClick={() =>
              setPending({ title: `Beleg ${c.weBelegNo} parken`, run: (r) => parkCase(c.id, r) })
            }
          >
            Parken
          </Button>
          {CANCELLABLE.includes(c.status) && (
            <Button
              variant="outlined"
              color="error"
              onClick={() =>
                setPending({
                  title: `Beleg ${c.weBelegNo} stornieren`,
                  run: (r) => cancelCase(c.id, r),
                })
              }
            >
              Stornieren
            </Button>
          )}
        </Stack>
      </Stack>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
        {TABS.map((t) => (
          <Tab key={t} label={t} />
        ))}
      </Tabs>

      <Paper variant="outlined" sx={{ p: 2 }}>
        {tab === 0 && (
          <FieldGrid
            rows={[
              ['WE-Belegnummer', c.weBelegNo],
              ['Lieferschein', c.deliveryNoteNo ?? '–'],
              ['Buchungsdatum', formatDate(c.bookingDate)],
              ['Lagerplatz', c.storageCode],
              ['Shopbereich', c.primaryShopAreaNo ?? '–'],
              ['Etage', c.primaryFloor ?? '–'],
              ['Belegmenge', String(c.totalQuantity)],
              ['Zugeteilt', c.assignedEmployeeName ?? '–'],
            ]}
          />
        )}
        {tab === 1 && (
          <FieldGrid
            rows={[
              ['Abschnitt', c.section === null ? '– (Prio ist kein Abschnitt)' : String(c.section)],
              ['Prio-Flags', c.priorityFlags.join(', ') || '–'],
              ['CatMan-Datum', formatDate(c.catManDate ?? undefined)],
              ['Verladetag', formatDate(c.loadPlanDate ?? undefined)],
              ['Warenart', c.goodsType ?? '–'],
            ]}
          />
        )}
        {tab === 2 && (
          <FieldGrid
            rows={[
              ['Aufwandspunkte', String(c.effortPoints)],
              ['Geschätzte Minuten', formatMinutes(c.estimatedMinutes)],
              ['Menge (Aufwandstreiber)', String(c.totalQuantity)],
              [
                'Preisetikett-Positionen',
                String(c.positions.filter((p) => p.priceLabelRequired).length),
              ],
              [
                'Sicherungs-Positionen',
                String(c.positions.filter((p) => p.securityRequired).length),
              ],
              [
                'Online-Positionen',
                String(c.positions.filter((p) => p.onlineHandlingRequired).length),
              ],
            ]}
          />
        )}
        {tab === 3 && <PositionsTab positions={c.positions} />}
        {tab === 4 && <BoxesTab boxes={c.boxes} />}
        {tab === 5 && <AbschlussTab zstRecords={c.zstRecords} totalQuantity={c.totalQuantity} />}
        {tab === 6 && (
          <IssuesTab
            issues={c.issues}
            onResolve={(id) =>
              setPending({ title: 'Problem lösen', run: (r) => resolveIssue(id, r) })
            }
            onRelease={(id) =>
              setPending({ title: 'Beleg freigeben', run: (r) => releaseIssue(id, r) })
            }
          />
        )}
        {tab === 7 && <HistoryTab history={c.history} />}
        {tab === 8 && <DocumentsTab documents={c.documents} />}
      </Paper>

      <ReasonDialog
        open={pending !== null}
        title={pending?.title ?? ''}
        onConfirm={(reason) => pending?.run(reason)}
        onClose={() => setPending(null)}
      />
    </Stack>
  );
}

function FieldGrid({ rows }: { rows: [string, ReactNode][] }): JSX.Element {
  return (
    <Box
      sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 2 }}
    >
      {rows.map(([label, value]) => (
        <Box key={label}>
          <Typography variant="caption" color="text.secondary">
            {label}
          </Typography>
          <Typography sx={{ fontWeight: 600 }}>{value}</Typography>
        </Box>
      ))}
    </Box>
  );
}

function PositionsTab({ positions }: { positions: BelegPosition[] }): JSX.Element {
  if (positions.length === 0) return <Empty text="Keine Positionen erfasst." />;
  return (
    <Stack spacing={2}>
      {positions.map((p) => (
        <Box key={p.id}>
          <Stack direction="row" gap={1} alignItems="center" sx={{ mb: 0.5 }} flexWrap="wrap">
            <Typography sx={{ fontWeight: 700 }}>
              Position {p.positionNo} · WGR {p.wgr} · {p.supplierColor}
            </Typography>
            {p.priceLabelRequired && <Chip size="small" label="Etikett" />}
            {p.securityRequired && <Chip size="small" color="warning" label="Sichern" />}
            {p.onlineHandlingRequired && <Chip size="small" label="Online" />}
          </Stack>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>EAN</TableCell>
                <TableCell>Größe</TableCell>
                <TableCell align="right">Soll</TableCell>
                <TableCell align="right">Ist</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {p.skuLines.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{s.ean}</TableCell>
                  <TableCell>{s.size}</TableCell>
                  <TableCell align="right">{s.expectedQuantity}</TableCell>
                  <TableCell align="right">{s.confirmedQuantity ?? '–'}</TableCell>
                  <TableCell>{s.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      ))}
    </Stack>
  );
}

function BoxesTab({ boxes }: { boxes: BelegBox[] }): JSX.Element {
  if (boxes.length === 0) return <Empty text="Noch keine Transportboxen berechnet." />;
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Box</TableCell>
          <TableCell>Shopbereich</TableCell>
          <TableCell>Etage</TableCell>
          <TableCell align="right">Menge</TableCell>
          <TableCell>Boxzettel</TableCell>
          <TableCell>Plombe</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {boxes.map((b) => (
          <TableRow key={b.id}>
            <TableCell>#{b.boxNo}</TableCell>
            <TableCell>{b.shopAreaNo}</TableCell>
            <TableCell>{b.floor ?? '–'}</TableCell>
            <TableCell align="right">{b.quantity}</TableCell>
            <TableCell>{b.labelStatus === 'not_required' ? 'Nicht nötig' : b.labelStatus}</TableCell>
            <TableCell>{b.sealed ? 'Versiegelt' : 'Offen'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function HistoryTab({ history }: { history: BelegHistoryEntry[] }): JSX.Element {
  if (history.length === 0) return <Empty text="Keine Ereignisse." />;
  return (
    <Stack spacing={0.5}>
      {history.map((e) => (
        <Typography key={e.id} variant="body2">
          <Box component="span" sx={{ color: 'text.secondary', mr: 1 }}>
            {formatDateTime(e.timestamp)}
          </Box>
          <strong>{formatAuditAction(e.eventType)}</strong> · {ACTOR_LABELS[toActorType(e.actorType)]}
          {e.reason ? ` — „${e.reason}"` : ''}
        </Typography>
      ))}
    </Stack>
  );
}

function DocumentsTab({ documents }: { documents: BelegDocument[] }): JSX.Element {
  if (documents.length === 0) return <Empty text="Keine Originaldokumente verknüpft." />;
  const labels: Record<string, string> = {
    work_instruction: 'Arbeitsanweisung',
    goods_receipt: 'WE-Beleg',
    delivery_note: 'Lieferschein',
  };
  return (
    <Stack spacing={1}>
      {documents.map((d) => (
        <Stack key={d.id} direction="row" spacing={1} alignItems="center">
          <Chip size="small" label={labels[d.kind] ?? d.kind} />
          <Tooltip title="Dokumentvorschau folgt (EPIC 3)">
            <Typography
              component="span"
              color="text.disabled"
              sx={{ textDecoration: 'line-through', cursor: 'not-allowed' }}
            >
              {d.fileName}
            </Typography>
          </Tooltip>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * Abschluss tab — the case's ZST completion result (§4.6/§15.1): one row per
 * ZST record (full or partial), with the booked quantity, effort, who/when, and
 * whether it has been exported to the legacy system (zst_done). For a terminal
 * case this is the meaningful state, where Positionen/Boxen show the work setup.
 */
function AbschlussTab({
  zstRecords,
  totalQuantity,
}: {
  zstRecords: BelegZst[];
  totalQuantity: number;
}): JSX.Element {
  if (zstRecords.length === 0) return <Empty text="Noch kein Abschluss (keine ZST gebucht)." />;
  const bookedQuantity = zstRecords.reduce((sum, z) => sum + z.completedQuantity, 0);
  return (
    <Stack spacing={2}>
      <FieldGrid
        rows={[
          ['Gebuchte Menge', `${bookedQuantity} / ${totalQuantity}`],
          ['ZST-Datensätze', String(zstRecords.length)],
          [
            'Export',
            zstRecords.every((z) => z.exportedAt !== null)
              ? 'Exportiert (zst_done)'
              : 'Noch nicht exportiert',
          ],
        ]}
      />
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Art</TableCell>
            <TableCell align="right">Menge</TableCell>
            <TableCell align="right">Aufwand</TableCell>
            <TableCell>ZST gesetzt</TableCell>
            <TableCell>Exportiert</TableCell>
            <TableCell>Quelle</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {zstRecords.map((z) => (
            <TableRow key={z.id}>
              <TableCell>{z.completedQuantity < totalQuantity ? 'Teilabschluss' : 'Vollabschluss'}</TableCell>
              <TableCell align="right">{z.completedQuantity}</TableCell>
              <TableCell align="right">{z.effortPoints}</TableCell>
              <TableCell>{formatDateTime(z.completedAt)}</TableCell>
              <TableCell>{z.exportedAt ? formatDateTime(z.exportedAt) : '–'}</TableCell>
              <TableCell>{z.source}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

/**
 * Problem tab — the case's reported issues (§4.5) with the teamlead triage path:
 * an open issue can be resolved (→ waiting_teamlead), a resolved-pending one can
 * be released back to work (→ checking). Without this the Problemfall is stuck.
 */
function IssuesTab({
  issues,
  onResolve,
  onRelease,
}: {
  issues: BelegIssue[];
  onResolve: (issueId: string) => void;
  onRelease: (issueId: string) => void;
}): JSX.Element {
  if (issues.length === 0) return <Empty text="Keine Probleme gemeldet." />;
  return (
    <Stack spacing={1.5}>
      {issues.map((i) => (
        <Box key={i.id}>
          <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
            <Typography sx={{ fontWeight: 700 }}>{i.issueType}</Typography>
            <Chip size="small" label={i.scope} />
            <Chip
              size="small"
              color={i.status === 'open' ? 'error' : i.status === 'in_review' ? 'warning' : 'default'}
              label={i.status}
            />
            <Typography variant="caption" color="text.secondary">
              {formatDateTime(i.reportedAt)}
            </Typography>
          </Stack>
          {i.description && (
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              „{i.description}"
            </Typography>
          )}
          {i.resolution && (
            <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
              Lösung: {i.resolution}
            </Typography>
          )}
          <Stack direction="row" spacing={1}>
            {i.status === 'open' && (
              <Button size="small" variant="outlined" onClick={() => onResolve(i.id)}>
                Problem lösen
              </Button>
            )}
            {i.status === 'in_review' && (
              <Button size="small" variant="outlined" color="success" onClick={() => onRelease(i.id)}>
                Freigeben (zurück in Arbeit)
              </Button>
            )}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

function Empty({ text }: { text: string }): JSX.Element {
  return (
    <Typography color="text.secondary" sx={{ py: 1 }}>
      {text}
    </Typography>
  );
}

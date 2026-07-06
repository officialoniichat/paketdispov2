/**
 * Belegdetails (§10.4): Kopf, Priorität, Aufwand, Positionen+SKU, Boxen,
 * Abschluss, Problem und Historie — read live from the backend
 * (`GET /api/teamlead/cases/:id`). Teamlead actions (Priorisieren/Parken) POST
 * through the store's audited (§8.4) endpoints and invalidate this view + the
 * cockpit on success.
 */
import { useState, type JSX, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { DeliveryGroupPanel } from './DeliveryGroupPanel';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
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
import Typography from '@mui/material/Typography';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { CaseStatusChip, PriorityChip, ProblemChip } from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import {
  fetchBelegDetail,
  type BelegBox,
  type BelegDetail,
  type BelegHistoryEntry,
  type BelegIssue,
  type BelegPosition,
  type BelegZst,
} from '../../data/belege.js';
import { formatDate, formatDateTime, formatMinutes } from '../../lib/format.js';
import { EFFORT_COMPONENT_LABEL, EFFORT_COMPONENT_ORDER } from '../../lib/effort.js';
import { CaseActionMenu } from '../../components/CaseActionMenu.js';
import { ForwardDialog, forwardRecipientLabel } from '../../components/ForwardDialog.js';
import { AttentionDialog } from '../../components/AttentionDialog.js';
import { AssignFromListDialog } from './AssignFromListDialog.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
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
];

/** Index of the Problem tab (deep-link target `?tab=problem`, C4). */
const PROBLEM_TAB_INDEX = 6;

/** Map the `?tab=` search param onto a tab index; unknown values open Kopf. */
function initialTab(param: string | null): number {
  return param === 'problem' ? PROBLEM_TAB_INDEX : 0;
}

export function BelegDetailPage(): JSX.Element {
  const { caseId = '' } = useParams();
  const {
    prioritiseCase,
    deprioritiseCase,
    parkCase,
    releaseCase,
    approveCase,
    reactivateCase,
    cancelCase,
    resolveIssue,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention,
  } = useCockpitData();
  const navigate = useNavigate();
  // C4 deep-link: /belege/:id?tab=problem opens the Problem tab directly.
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(() => initialTab(searchParams.get('tab')));
  // Zuweisen/Weiterleiten/Besondere Aufmerksamkeit: shared CaseActionMenu custom actions.
  const [assignOpen, setAssignOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);

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

  // Narrowed once so the per-driver breakdown stays type-safe inside the tab callbacks.
  const effortComponents = c.effortComponents;
  // C4: latest unresolved problem for the banner (issues arrive newest first).
  const openIssue = c.issues.find((i) => i.status !== 'resolved' && i.status !== 'rejected') ?? null;

  const actionCtx: CaseActionCtx = {
    caseId: c.id,
    store: {
      prioritiseCase,
      deprioritiseCase,
      parkCase,
      releaseCase,
      approveCase,
      reactivateCase,
      cancelCase,
      resolveIssue,
      forwardCase,
      unforwardCase,
      flagAttention,
      unflagAttention,
    },
  };

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
            {c.attentionFlag && (
              <Chip size="small" color="warning" variant="outlined" label="Besondere Aufmerksamkeit" />
            )}
            {c.forwardedTo !== null && (
              <Chip
                size="small"
                color="secondary"
                variant="outlined"
                label={`Weitergeleitet → ${forwardRecipientLabel(c.forwardedTo)}`}
              />
            )}
          </Stack>
        </Box>
        <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap">
          <CaseActionMenu
            density="detail"
            case={{
              status: c.status,
              priorityFlags: c.priorityFlags,
              assignedTo: c.assignedEmployeeName,
              forwardedTo: c.forwardedTo,
              attentionFlag: c.attentionFlag,
            }}
            weBelegNo={c.weBelegNo}
            ctx={actionCtx}
            onAssign={() => setAssignOpen(true)}
            onForward={() => setForwardOpen(true)}
            onAttention={() => setAttentionOpen(true)}
          />
        </Stack>
      </Stack>

      {/* C4: an open problem is surfaced on EVERY tab, with a jump to the Problem tab. */}
      {c.hasOpenIssue && openIssue && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setTab(PROBLEM_TAB_INDEX)}>
              Zum Problem
            </Button>
          }
        >
          Offenes Problem: <strong>{openIssue.issueType}</strong>
          {openIssue.description ? ` — „${openIssue.description}"` : ''}
        </Alert>
      )}

      {c.attentionFlag && c.attentionNote && (
        <Alert severity="warning" variant="outlined">
          Hinweis der Bucherin: „{c.attentionNote}"
        </Alert>
      )}

      {c.deliveryGroup && <DeliveryGroupPanel caseId={c.id} group={c.deliveryGroup} />}

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
              ['Filiale', c.branchNo],
              ['Buchungsdatum', formatDate(c.bookingDate)],
              ['Lagerplatz', c.storageCode],
              ['Shopbereich', c.primaryShopAreaNo ?? '–'],
              ['Shops', c.shopNos.length > 0 ? c.shopNos.join(', ') : '–'],
              ['Etage', c.primaryFloor ?? '–'],
              ['Kartons (Anlieferung)', c.inboundCartonCount === null ? '–' : String(c.inboundCartonCount)],
              ['Etiketten', c.labelsRequired ? 'ja' : 'nein'],
              ['Belegmenge', String(c.totalQuantity)],
              ['Zugeteilt', c.assignedEmployeeName ?? '–'],
              [
                'DocuWare',
                c.docuWareUrl ? (
                  <Link href={c.docuWareUrl} target="_blank" rel="noopener" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                    Langzeitarchiv öffnen <OpenInNewIcon fontSize="inherit" />
                  </Link>
                ) : (
                  '–'
                ),
              ],
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
          <Stack spacing={1.5}>
            <FieldGrid
              rows={[
                ['Aufwandspunkte', String(c.effortPoints)],
                ['Geschätzte Minuten', formatMinutes(c.estimatedMinutes)],
                ['Menge (Aufwandstreiber)', String(c.totalQuantity)],
                [
                  'Berechnung',
                  c.effortComputed
                    ? 'Live aus Arbeitsanweisung (Aufwandsparameter)'
                    : 'Gespeicherter Schätzwert (keine Arbeitsanweisung)',
                ],
              ]}
            />
            {effortComponents ? (
              <>
                <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
                  Aufwandsaufschlüsselung (Minuten)
                </Typography>
                <FieldGrid
                  rows={EFFORT_COMPONENT_ORDER.map((k) => [
                    EFFORT_COMPONENT_LABEL[k],
                    formatMinutes(effortComponents[k]),
                  ])}
                />
              </>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Ohne Arbeitsanweisung wird der gespeicherte Schätzwert angezeigt. Sobald
                Positionsdaten vorliegen, berechnet das System den Aufwand live aus den
                Aufwandsparametern (Admin → „Aufwand“).
              </Typography>
            )}
          </Stack>
        )}
        {tab === 3 && <PositionsTab positions={c.positions} />}
        {tab === 4 && <BoxesTab boxes={c.boxes} />}
        {tab === 5 && <AbschlussTab zstRecords={c.zstRecords} totalQuantity={c.totalQuantity} />}
        {tab === 6 && <IssuesTab issues={c.issues} />}
        {tab === 7 && <HistoryTab history={c.history} />}
      </Paper>

      <AssignFromListDialog
        open={assignOpen}
        beleg={{
          id: c.id,
          weBelegNo: c.weBelegNo,
          // Bereich isn't part of the case-detail read; the soft mismatch hint
          // in the dialog simply stays hidden (only shown when both sides are known).
          bereich: null,
          quantity: c.totalQuantity,
          deliveryGroup: c.deliveryGroup,
          attentionNote: c.attentionNote,
        }}
        onClose={() => setAssignOpen(false)}
      />

      <ForwardDialog
        open={forwardOpen}
        weBelegNo={c.weBelegNo}
        onConfirm={(recipient) => forwardCase(c.id, recipient)}
        onClose={() => setForwardOpen(false)}
      />

      <AttentionDialog
        open={attentionOpen}
        weBelegNo={c.weBelegNo}
        onConfirm={(note) => flagAttention(c.id, note)}
        onClose={() => setAttentionOpen(false)}
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
 * Problem tab — read-only view of the case's reported issues (§4.5). The triage
 * action („Problem freigeben", issue_open → in_progress) lives in the header
 * {@link CaseActions} bar, driven by the §7.1 case status, so this tab is pure
 * information.
 */
function IssuesTab({ issues }: { issues: BelegIssue[] }): JSX.Element {
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
            <Typography variant="body2" color="text.secondary">
              Lösung: {i.resolution}
            </Typography>
          )}
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

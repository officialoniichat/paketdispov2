/**
 * Belegdetails (§10.4): der Beleg-Tab zeigt Kopf, Positionen und Probleme in
 * EINER kombinierten Ansicht (Kundenfeedback 15.07.2026; Vorlage: employee-pwa
 * BelegProcessScreen), daneben nur noch Aufwand, Abschluss, Historie und
 * Priorität (ganz rechts) — read live from the backend
 * (`GET /api/teamlead/cases/:id`). Teamlead actions (Priorisieren/Parken) POST
 * through the store's audited (§8.4) endpoints and invalidate this view + the
 * cockpit on success.
 */
import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import SendIcon from '@mui/icons-material/Send';
import {
  CaseStatusChip,
  issueScopeLabels,
  problemKindLabels,
  PriorityChip,
  ProblemChip,
  skuLineStatusLabels,
  zstSourceLabels,
} from '@paket/ui';
import { useCockpitData } from '../../data/store.js';
import {
  fetchBelegDetail,
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
import { InstructionsDialog } from '../../components/InstructionsDialog.js';
import { IssueMessageList } from '../../components/IssueMessageList.js';
import { AssignFromListDialog } from './AssignFromListDialog.js';
import { fetchEmployees } from '../../data/employees.js';
import { useSplits } from '../split/SplitProvider.js';
import { SplitDialog, type SplitDialogEmployee } from '../split/SplitDialog.js';
import type { CaseActionCtx } from '../../actions/caseActions.js';
import { ACTOR_LABELS, formatAuditAction } from '../../data/audit.js';
import { toActorType } from '../../data/narrow.js';
import { LABEL_PRINT_VARIANT_DISPLAY } from '@paket/domain-types';
import { LabelPrintVariantIcon } from '@paket/ui';

const TABS = [
  'Beleg',
  'Verlauf',
  'Aufwand',
  'Abschluss',
  'Historie',
  'Priorität',
];

export function BelegDetailPage(): JSX.Element {
  const { caseId = '' } = useParams();
  const {
    prioritiseCase,
    deprioritiseCase,
    parkCase,
    releaseCase,
    approveCase,
    cancelCase,
    sendInstruction,
    forwardCase,
    unforwardCase,
    flagAttention,
    unflagAttention,
  } = useCockpitData();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);
  // Zuweisen/Weiterleiten/Besondere Aufmerksamkeit/Aufteilen/Instruktionen:
  // shared CaseActionMenu custom actions.
  const [assignOpen, setAssignOpen] = useState(false);
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitDone, setSplitDone] = useState<string | null>(null);
  const { recordSplit } = useSplits();
  const employeesQuery = useQuery({
    queryKey: ['admin', 'employees', 'split'],
    queryFn: () => fetchEmployees(),
    staleTime: 5 * 60 * 1000,
  });
  const splitEmployees = useMemo<SplitDialogEmployee[]>(
    () =>
      (employeesQuery.data?.employees ?? [])
        .filter((e) => e.active && e.netCapacityToday > 0)
        .map((e) => ({ id: e.id, name: e.displayName, ceilingMinutes: e.netCapacityToday })),
    [employeesQuery.data],
  );

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
  // Instruktions-Loop (04.08.2026): offene Meldungen treiben Banner + Aktion.
  const openIssues = c.issues.filter((i) => i.status === 'open');

  const actionCtx: CaseActionCtx = {
    caseId: c.id,
    store: {
      prioritiseCase,
      deprioritiseCase,
      parkCase,
      releaseCase,
      approveCase,
      cancelCase,
      sendInstruction,
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
            onSplit={() => setSplitOpen(true)}
            onInstructions={() => setInstructionsOpen(true)}
          />
        </Stack>
      </Stack>

      {splitDone && (
        <Alert
          severity="success"
          onClose={() => setSplitDone(null)}
          action={
            <Button color="inherit" size="small" onClick={() => navigate('/aufteilungen')}>
              Zur Leistung
            </Button>
          }
        >
          Beleg {splitDone} aufgeteilt — Leistung je Anteil unter „Aufteilungen".
        </Alert>
      )}

      {/* C4: offene Meldungen erscheinen auf JEDEM Tab; Probleme leben in der Beleg-Ansicht. */}
      {c.hasOpenIssue && openIssues.length > 0 && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => setInstructionsOpen(true)}>
              Instruktionen senden
            </Button>
          }
        >
          {openIssues.length === 1 ? (
            <>
              Offene Meldung:{' '}
              <strong>
                {openIssues[0]!.reasonLabel ?? problemKindLabels[openIssues[0]!.kind]}
              </strong>
              {openIssues[0]!.description ? ` — „${openIssues[0]!.description}"` : ''}
            </>
          ) : (
            <>
              <strong>{openIssues.length} offene Meldungen</strong> — jede braucht ihre eigene
              Instruktion, erst dann gilt der Beleg als geklärt.
            </>
          )}
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
        {tab === 0 && <BelegTab c={c} />}
        {tab === 1 && (
          <VerlaufTab
            issues={c.issues}
            onReply={(issueId, text) => sendInstruction(c.id, issueId, text)}
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
        {tab === 3 && <AbschlussTab zstRecords={c.zstRecords} totalQuantity={c.totalQuantity} />}
        {tab === 4 && <HistoryTab history={c.history} />}
        {tab === 5 && (
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

      {/* Instruktions-Loop (04.08.2026): je Meldung ein Pflichttext, einzeln absendbar. */}
      <InstructionsDialog
        open={instructionsOpen}
        weBelegNo={c.weBelegNo}
        issues={c.issues}
        onSend={(issueId, text) => sendInstruction(c.id, issueId, text)}
        onClose={() => setInstructionsOpen(false)}
      />

      <SplitDialog
        open={splitOpen}
        beleg={{
          caseId: c.id,
          weBelegNo: c.weBelegNo,
          totalQuantity: c.totalQuantity,
          effortPoints: c.effortPoints,
          estimatedMinutes: c.estimatedMinutes,
        }}
        employees={splitEmployees}
        onConfirm={(input) => {
          recordSplit(input);
          setSplitDone(input.weBelegNo);
        }}
        onClose={() => setSplitOpen(false)}
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

/**
 * Beleg-Tab — Kopf, Positionen und Probleme in EINER Ansicht (Kundenfeedback
 * 15.07.2026). Vorlage ist die kombinierte Darstellung des Mitarbeiter-UIs
 * (employee-pwa BelegProcessScreen): Beleg-Kopf oben, darunter die eine
 * Positionen-Tabelle mit Problem-Markierungen direkt an der Ware, darunter die
 * gesammelten Probleme des Belegs.
 */
function BelegTab({ c }: { c: BelegDetail }): JSX.Element {
  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Kopf
        </Typography>
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
      </Box>
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Positionen
        </Typography>
        <PositionsSection positions={c.positions} issues={c.issues} />
      </Box>
      <Box>
        <Typography variant="subtitle2" gutterBottom>
          Probleme
        </Typography>
        <IssuesTab issues={c.issues} weBelegNo={c.weBelegNo} deliveryNoteNo={c.deliveryNoteNo} />
      </Box>
    </Stack>
  );
}

/** Kopfzeilen-Zellen der Positionen-Tabelle (sticky, PWA-Vorlage A1). */
const POSITION_HEAD_CELL = { fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' } as const;

/** Ziffern in Zahlenspalten laufen einspurig, sonst wandert das Komma je Zeile (PWA-Vorlage). */
const NUMERIC_CELL = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

/** PWA-Vorlage Punkt 9: betroffene Größenzeilen rot markieren. */
const PROBLEM_ROW_SX = {
  bgcolor: 'rgba(211, 47, 47, 0.08)',
  borderLeft: '3px solid',
  borderLeftColor: 'error.main',
} as const;

/** Warenart-Anzeige wie in der PWA: NOS schlägt die Warenart des Beleg-Kopfs. */
function positionWarenart(p: BelegPosition): string | null {
  if (p.nosFlag) return 'NOS';
  return p.goodsType ?? null;
}

/**
 * Positions-Kontext als horizontale Meta-Zeile (identisch zur PWA, Nachtrag
 * 15.07.2026): HS · Shop · Etage · Filiale · Bereich. Der frühere Boxen-Umweg
 * entfällt — diese Infos stehen jetzt an der Position.
 */
function positionMetaText(p: BelegPosition): string {
  return [
    p.hShopNo ? `HS ${p.hShopNo}` : null,
    `Shop ${p.shopNo}`,
    p.floor ? `Etage ${p.floor}` : null,
    p.branchNo ? `Filiale ${p.branchNo}` : null,
    p.shopAreaNo ? `Bereich ${p.shopAreaNo}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
}

/**
 * Anweisungs-Chips der Position (PWA-Vorlage: FLAG_CHIPS im BelegProcessScreen).
 * Der frühere generische „Etikett"-Chip ist durch die konkrete
 * Etikett-Druckvariante ersetzt (Kundenfeedback 03.08.2026) — sie steht als
 * eigener Chip davor, damit PWA und Cockpit dieselbe Aussage treffen.
 */
const POSITION_FLAG_CHIPS = [
  { key: 'securityRequired', label: '🔒 Sicherung', color: 'warning' },
  { key: 'onlineHandlingRequired', label: '🌐 Online', color: 'info' },
] as const;

/**
 * Positionen der kombinierten Beleg-Ansicht — Vorlage: employee-pwa
 * BelegProcessScreen (A1): EINE Tabelle mit sticky Kopfzeile; je Position eine
 * Kopfzeile (Pos-Nr, WGR + Klartext, Farbe, Ordernummer, Anweisungs-Chips) und
 * je Größe eine Zeile. Probleme stehen direkt an der Ware: offene Probleme als
 * rote Chips an ihrer Position, betroffene Größenzeilen (gemeldete EAN/Größe
 * oder bestätigte Mengenabweichung) rot markiert (PWA Punkt 9).
 */
function PositionsSection({
  positions,
  issues,
}: {
  positions: BelegPosition[];
  issues: BelegIssue[];
}): JSX.Element {
  if (positions.length === 0) return <Empty text="Keine Positionen erfasst." />;
  const openIssues = issues.filter((i) => i.status === 'open');
  return (
    <Paper variant="outlined">
      <TableContainer sx={{ overflowX: 'auto', maxHeight: 560 }}>
        <Table size="small" stickyHeader aria-label="Positionen">
          <TableHead>
            <TableRow>
              <TableCell sx={POSITION_HEAD_CELL}>Pos</TableCell>
              <TableCell sx={POSITION_HEAD_CELL}>EAN</TableCell>
              <TableCell sx={POSITION_HEAD_CELL}>Größe</TableCell>
              {/* Teamlead-Extras zur Klärung/Steuerung: EK/VK/VK-Etikett je Größe. */}
              <TableCell sx={POSITION_HEAD_CELL} align="right">
                EK
              </TableCell>
              <TableCell sx={POSITION_HEAD_CELL} align="right">
                VK
              </TableCell>
              <TableCell sx={POSITION_HEAD_CELL} align="right">
                VK-Etikett
              </TableCell>
              <TableCell sx={POSITION_HEAD_CELL} align="right">
                Soll
              </TableCell>
              <TableCell sx={POSITION_HEAD_CELL} align="right">
                Ist
              </TableCell>
              <TableCell sx={POSITION_HEAD_CELL}>Mehr-/Mindermenge</TableCell>
              <TableCell sx={POSITION_HEAD_CELL}>Status</TableCell>
            </TableRow>
          </TableHead>
          {positions.map((p) => {
            const positionIssues = openIssues.filter((i) => i.positionNo === p.positionNo);
            const flags = POSITION_FLAG_CHIPS.filter((f) => p[f.key]);
            const warenart = positionWarenart(p);
            return (
              <TableBody key={p.id}>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ verticalAlign: 'top' }}>
                    <Typography sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                      Pos {p.positionNo}
                    </Typography>
                  </TableCell>
                  <TableCell colSpan={9} sx={{ verticalAlign: 'top' }}>
                    <Stack
                      direction="row"
                      spacing={2}
                      justifyContent="space-between"
                      alignItems="flex-start"
                    >
                      <Box sx={{ minWidth: 0 }}>
                        <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
                          <Typography sx={{ fontWeight: 700 }}>
                            {p.supplierArticleNo} · WGR {p.wgr}
                            {p.wgrDescription ? ` ${p.wgrDescription}` : ''} · {p.supplierColor}
                            {p.season ? ` · Saison ${p.season}` : ''}
                          </Typography>
                          {p.nosFlag && <Chip size="small" color="success" label="♻️ NOS" />}
                          {!p.nosFlag && warenart && (
                            <Chip size="small" color="secondary" variant="outlined" label={warenart} />
                          )}
                          {/* Ordernummer nur in der Teamlead-UX — zur Fehlerlösung (Nachtrag 15.07.2026). */}
                          {p.orderNo && <Chip size="small" variant="outlined" label={`Order ${p.orderNo}`} />}
                          {/* Etikett-Druckvariante der Position (Kundenfeedback 03.08.2026). */}
                          <Chip
                            size="small"
                            color={
                              p.labelPrintVariant === 'digitag_etikett_ohne_preis'
                                ? 'secondary'
                                : 'default'
                            }
                            variant={p.labelPrintVariant === 'kein_etikett' ? 'outlined' : 'filled'}
                            icon={
                              <LabelPrintVariantIcon
                                variant={p.labelPrintVariant}
                                fontSize="small"
                              />
                            }
                            label={LABEL_PRINT_VARIANT_DISPLAY[p.labelPrintVariant].label}
                          />
                          {flags.map((f) => (
                            <Chip key={f.key} size="small" color={f.color} label={f.label} />
                          ))}
                        </Stack>
                        {/* Positions-Kontext (wie PWA): HS · Shop · Etage · Filiale · Bereich, CatMan als Chip. */}
                        <Stack direction="row" alignItems="center" sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.75 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {positionMetaText(p)}
                          </Typography>
                          {p.catManDate && (
                            <Chip
                              size="small"
                              variant="outlined"
                              color="warning"
                              label={`📅 ${formatDate(p.catManDate)}`}
                              sx={{ height: 22, '& .MuiChip-label': { px: 0.75 } }}
                            />
                          )}
                        </Stack>
                        {positionIssues.length > 0 && (
                          <Stack direction="row" sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                            {positionIssues.map((i) => (
                              <Chip
                                key={i.id}
                                size="small"
                                color="error"
                                label={i.description ? `${issueLabel(i)}: ${i.description}` : issueLabel(i)}
                              />
                            ))}
                          </Stack>
                        )}
                      </Box>
                      <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                        Soll gesamt {p.expectedQuantity}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
                {p.skuLines.map((s) => {
                  const delta =
                    s.confirmedQuantity === null ? 0 : s.confirmedQuantity - s.expectedQuantity;
                  const hasIssue = openIssues.some(
                    (i) => i.positionNo === p.positionNo && i.ean === s.ean && i.size === s.size,
                  );
                  return (
                    <TableRow key={s.id} hover sx={delta !== 0 || hasIssue ? PROBLEM_ROW_SX : undefined}>
                      <TableCell />
                      <TableCell sx={NUMERIC_CELL}>{s.ean}</TableCell>
                      <TableCell sx={{ fontWeight: 700 }}>{s.size}</TableCell>
                      <TableCell align="right" sx={NUMERIC_CELL}>
                        {s.ekPrice !== null ? EUR.format(s.ekPrice) : '–'}
                      </TableCell>
                      <TableCell align="right" sx={NUMERIC_CELL}>
                        {s.vkPrice !== null ? EUR.format(s.vkPrice) : '–'}
                      </TableCell>
                      <TableCell align="right" sx={NUMERIC_CELL}>
                        {s.vkLabelPrice !== null ? EUR.format(s.vkLabelPrice) : '–'}
                      </TableCell>
                      <TableCell align="right" sx={NUMERIC_CELL}>
                        {s.expectedQuantity}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{ ...NUMERIC_CELL, ...(delta !== 0 ? { color: 'error.main', fontWeight: 700 } : {}) }}
                      >
                        {s.confirmedQuantity ?? '–'}
                      </TableCell>
                      <TableCell>
                        {delta !== 0 && (
                          <Chip
                            size="small"
                            color="warning"
                            label={delta > 0 ? `+${delta} Mehrmenge` : `−${Math.abs(delta)} Mindermenge`}
                          />
                        )}
                      </TableCell>
                      <TableCell>{skuLineStatusLabels[s.status]}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            );
          })}
        </Table>
      </TableContainer>
    </Paper>
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
 * case this is the meaningful state; die Beleg-Ansicht zeigt das Arbeits-Setup.
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
              <TableCell>{zstSourceLabels[z.source]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Stack>
  );
}

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** Problemart-Label: Katalog-Snapshot bei manuellen Problemen, sonst die feste Art. */
function issueLabel(i: BelegIssue): string {
  return i.kind === 'manual' ? (i.reasonLabel ?? problemKindLabels.manual) : problemKindLabels[i.kind];
}

/** Bezugszeile eines Problems: Position + Ordernummer + optional EAN/Größe (Klärungs-UX). */
function issueScopeLine(i: BelegIssue): string | null {
  if (i.positionNo === null) return null;
  const parts = [`Position ${i.positionNo}`];
  if (i.orderNo) parts.push(`Order ${i.orderNo}`);
  if (i.size) parts.push(i.size);
  if (i.ean) parts.push(i.ean);
  return parts.join(' · ');
}

/**
 * Probleme-Abschnitt — die Klärungs-UX für den Teamlead (Kundenfeedback
 * 04.08.2026). Zeigt ALLE Meldungen des Belegs mit Grund/Art, Position +
 * EAN/Größe, Mengen-Delta, Preis-Korrektur — und je Meldung den EINZEL-Status
 * (Offen / Instruktion gesendet) samt Instruktionstext. Die Aktion
 * „Instruktionen senden" (je Meldung ein Pflichttext) liegt in der Header-
 * Aktionsleiste; erst wenn alle Meldungen instruiert sind, wird der Beleg grün.
 */
function IssuesTab({
  issues,
  weBelegNo,
  deliveryNoteNo,
}: {
  issues: BelegIssue[];
  weBelegNo: string;
  deliveryNoteNo: string | null;
}): JSX.Element {
  if (issues.length === 0) return <Empty text="Keine Probleme gemeldet." />;
  return (
    <Stack spacing={1.5}>
      {/* Bezugsnummern zur Fehlerlösung: WE-Nr + Lieferschein am Kopf, Ordernummer je Problem. */}
      <Alert severity="info" variant="outlined">
        <Stack direction="row" gap={2} flexWrap="wrap">
          <span>
            WE-Nr: <strong>{weBelegNo}</strong>
          </span>
          <span>
            Lieferschein: <strong>{deliveryNoteNo ?? '–'}</strong>
          </span>
          <Typography component="span" variant="caption" color="text.secondary">
            Ordernummer je Position bei den einzelnen Problemen.
          </Typography>
        </Stack>
      </Alert>
      <Typography variant="body2" color="text.secondary">
        Jede Meldung braucht ihre eigene Instruktion („Instruktionen senden"). Erst wenn keine
        Meldung mehr offen ist, geht der Beleg grün markiert zurück an den Mitarbeiter.
      </Typography>
      {issues.map((i) => {
        const scopeLine = issueScopeLine(i);
        const label = issueLabel(i);
        return (
          <Box key={i.id}>
            <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.5 }}>
              <Typography sx={{ fontWeight: 700 }}>{label}</Typography>
              <Chip size="small" label={issueScopeLabels[i.scope]} />
              <ProblemChip status={i.status} size="small" />
              <Typography variant="caption" color="text.secondary">
                {formatDateTime(i.reportedAt)}
              </Typography>
            </Stack>
            {scopeLine && (
              <Typography variant="body2" color="text.secondary">
                {scopeLine}
              </Typography>
            )}
            {i.deviationQty !== null && i.deviationQty !== 0 && (
              <Typography variant="body2">
                {i.deviationQty > 0
                  ? `Mehrlieferung +${i.deviationQty} Teile`
                  : `Minderlieferung −${Math.abs(i.deviationQty)} Teile`}
              </Typography>
            )}
            {i.correctedVkPrice !== null && (
              <Typography variant="body2">
                Preis: VK-Etikett {i.expectedVkPrice !== null ? EUR.format(i.expectedVkPrice) : '–'} →
                Etikettpreis {EUR.format(i.correctedVkPrice)}
              </Typography>
            )}
            {i.description && (
              <Typography variant="body2" sx={{ mb: 0.5 }}>
                „{i.description}"
              </Typography>
            )}
            {i.instruction && (
              <Typography variant="body2" color="success.main">
                Instruktion: „{i.instruction}"
              </Typography>
            )}
          </Box>
        );
      })}
    </Stack>
  );
}

/**
 * Reiter „Verlauf" (Kundenfeedback 04.08.2026): kompletter Nachrichten-Verlauf
 * je Position — wer hat wann was gesagt (MA-Meldung, TL-Instruktion,
 * MA-Rückmeldung), mit Zeitstempel und Namen (gemeinsame Darstellung:
 * IssueMessageList). Sind mehrere Positionen betroffen, bekommt JEDE Position
 * ihren eigenen Tab; Meldungen ohne Positions-Anker gruppieren unter
 * „Beleg allgemein". Auf OFFENE Meldungen (Erst-Meldung wie MA-Rückmeldung)
 * antwortet die Teamleitung direkt hier — dieselbe Instruktions-Aktion wie im
 * Dialog „Instruktionen senden"; die Statuslogik bleibt im Backend.
 */
function VerlaufTab({
  issues,
  onReply,
}: {
  issues: BelegIssue[];
  onReply: (issueId: string, text: string) => void;
}): JSX.Element {
  const [tabIdx, setTabIdx] = useState(0);
  // Antwort-Entwürfe je Meldung — bleiben beim Senden anderer Meldungen erhalten.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  if (issues.length === 0) return <Empty text="Keine Meldungen — kein Verlauf." />;
  // Gruppierung je Position (Meldungen ohne Anker unter „Beleg allgemein").
  const groups = new Map<string, { tabLabel: string; title: string; issues: BelegIssue[] }>();
  for (const issue of issues) {
    const key = issue.positionNo === null ? 'beleg' : `pos-${issue.positionNo}`;
    const tabLabel = issue.positionNo === null ? 'Beleg allgemein' : `Position ${issue.positionNo}`;
    const title =
      issue.positionNo === null
        ? 'Beleg allgemein'
        : `Position ${issue.positionNo}${issue.orderNo ? ` · Order ${issue.orderNo}` : ''}`;
    const group = groups.get(key) ?? { tabLabel, title, issues: [] };
    group.issues.push(issue);
    groups.set(key, group);
  }
  const list = [...groups.values()];
  const activeIdx = Math.min(tabIdx, list.length - 1);
  const active = list[activeIdx];
  if (!active) return <Empty text="Keine Meldungen — kein Verlauf." />;
  const send = (issueId: string): void => {
    const text = (drafts[issueId] ?? '').trim();
    if (text === '') return;
    onReply(issueId, text);
    setDrafts((d) => ({ ...d, [issueId]: '' }));
  };
  return (
    <Stack spacing={1.5}>
      {list.length > 1 ? (
        <Tabs
          value={activeIdx}
          onChange={(_, v: number) => setTabIdx(v)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          {list.map((group) => (
            <Tab key={group.tabLabel} label={group.tabLabel} />
          ))}
        </Tabs>
      ) : null}
      <Box>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
          {active.title}
        </Typography>
        <Stack spacing={2.5} sx={{ mt: 0.5 }}>
          {active.issues.map((issue) => (
            <Box key={issue.id}>
              <Stack direction="row" gap={1} alignItems="center" flexWrap="wrap" sx={{ mb: 0.75 }}>
                <Typography sx={{ fontWeight: 700 }}>{issueLabel(issue)}</Typography>
                <ProblemChip status={issue.status} size="small" />
              </Stack>
              <IssueMessageList messages={issue.messages} />
              {/* Offene Meldung (Erst-Meldung wie MA-Rückmeldung): die TL
                  antwortet direkt im Verlauf — gleiche Aktion wie im Dialog. */}
              {issue.status === 'open' ? (
                <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1 }}>
                  <TextField
                    fullWidth
                    required
                    multiline
                    minRows={2}
                    size="small"
                    label="Antwort / Instruktion an den Mitarbeiter (Pflichtfeld)"
                    value={drafts[issue.id] ?? ''}
                    onChange={(e) => setDrafts((d) => ({ ...d, [issue.id]: e.target.value }))}
                  />
                  <Button
                    variant="contained"
                    color="success"
                    startIcon={<SendIcon />}
                    disabled={(drafts[issue.id] ?? '').trim() === ''}
                    onClick={() => send(issue.id)}
                    sx={{ whiteSpace: 'nowrap', mt: 0.25 }}
                  >
                    Senden
                  </Button>
                </Stack>
              ) : null}
            </Box>
          ))}
        </Stack>
      </Box>
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

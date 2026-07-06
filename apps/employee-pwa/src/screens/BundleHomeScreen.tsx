/**
 * Home hub — ONE screen for the whole bundle flow (Dustin B1).
 *
 * Section „1 · Ware holen" lists the route-ordered pick stops inline; checking
 * off (Paket geholt) happens right here — no extra window. Section
 * „2 · Bearbeiten" lists the Belege directly below. Collecting stays the hard
 * gate; once fetched, the worker freely picks which Beleg to work first
 * (Warenart labels like NOS/EB support self-prioritisation — no system
 * recommendation). „Rest parken" (B4) sends the Belege of not-yet-fetched
 * stops back to the pool when the cart is full.
 */
import { useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { DemoControls } from '../components/DemoControls.js';
import { demoControlsEnabled, isBackendEnabled } from '../data/api.js';
import { getWorkstation } from '../data/workstation.js';
import { db } from '../db/db.js';
import { useBundle } from '../workflow/useBundle.js';
import { useScanner } from '../scanner/useScanner.js';
import { deriveBelegStatus, isBelegClosed, nextOpenBeleg, orderBelege } from '../workflow/belegList.js';
import { scanMatches } from '../workflow/workflowModel.js';
import type { BelegListItem, BelegStatus, GoodsCategory } from '../db/types.js';
import { parkRemainingBelege, pullNextBundle } from '../db/sync.js';
import { cycleDemoScenario } from '../db/seed.js';
import { caseProcessPath } from '../routes/paths.js';

/** German messaging for the backend's "no cart assigned" reasons (§continuation). */
const PULL_REASON_MSG: Record<string, string> = {
  pool_empty: 'Aktuell nichts frei zum Holen.',
  capacity_done: 'Feierabend – Tageskapazität erreicht.',
  shift_ending: 'Schichtende – kein neues Bündel mehr, damit nichts offen liegen bleibt.',
  no_shift: 'Heute keine Schicht eingeplant.',
  active_bundle: 'Es läuft noch ein Bündel.',
  error: 'Konnte nicht laden – bitte später erneut.',
};

const STATUS_CHIP: Record<
  BelegStatus,
  { label: string; color: 'default' | 'primary' | 'success' | 'warning' | 'error' }
> = {
  open: { label: 'Offen', color: 'default' },
  in_progress: { label: 'In Arbeit', color: 'primary' },
  done: { label: 'Fertig', color: 'success' },
  partial: { label: 'Teilabschluss', color: 'warning' },
  issue: { label: 'Problem', color: 'error' },
};

/** B6: Icon je Lagerplatz-Art (LocationKind-abgeleitet): Regal / Palette / Kleiderbügel. */
const ICON: Record<GoodsCategory, string> = {
  regal: '🗄️',
  palette: '🟧',
  haengeware: '🧥',
  mixed: '📦',
};

/** A3: greeting adapts to the time of day. */
export function greetingForHour(hour: number): string {
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Guten Tag';
  return 'Guten Abend';
}

export function BundleHomeScreen(): JSX.Element {
  const navigate = useNavigate();
  const { loading, bundle, stops, collectProgress, belege, counts, collectComplete, toggleStop } =
    useBundle();
  const progressRows = useLiveQuery(() => db.progress.toArray(), []);
  const events = useLiveQuery(() => db.events.toArray(), []);
  const [pulling, setPulling] = useState(false);
  const [pullMsg, setPullMsg] = useState<string | undefined>(undefined);
  const [parking, setParking] = useState(false);
  const [parkMsg, setParkMsg] = useState<string | undefined>(undefined);

  const collected = new Set(collectProgress?.collectedSequences ?? []);

  // Optional scan: a scanned code that matches an unfetched stop checks it off.
  useScanner({
    onScan: (code) => {
      const hit = stops.find((s) => !collected.has(s.sequence) && scanMatches(code, s.locationCode));
      if (hit) void toggleStop(hit.sequence);
    },
  });

  // Pull the next cart (backend) or advance the demo Belegset (offline). The live
  // queries refresh the home automatically once the store is rewritten.
  const handleNextBundle = async (): Promise<void> => {
    setPullMsg(undefined);
    setPulling(true);
    try {
      if (isBackendEnabled) {
        const result = await pullNextBundle();
        if (!result.assigned) {
          setPullMsg(PULL_REASON_MSG[result.reason ?? 'error'] ?? PULL_REASON_MSG.error);
        }
      } else {
        await cycleDemoScenario();
      }
    } finally {
      setPulling(false);
    }
  };

  // B4 Parkposition: the Belege of not-yet-fetched stops go back to the pool.
  const uncollectedCaseIds = stops
    .filter((s) => !collected.has(s.sequence))
    .flatMap((s) => s.caseIds);

  const handlePark = async (): Promise<void> => {
    setParkMsg(undefined);
    setParking(true);
    try {
      const { parkedCount } = await parkRemainingBelege(uncollectedCaseIds, db, isBackendEnabled);
      setParkMsg(
        `${parkedCount} Beleg${parkedCount === 1 ? '' : 'e'} geparkt – kommen ins nächste Bündel.`,
      );
    } catch (err) {
      setParkMsg(err instanceof Error ? err.message : 'Parken fehlgeschlagen');
    } finally {
      setParking(false);
    }
  };

  if (loading || progressRows === undefined) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton count={3} />
      </Box>
    );
  }

  const progressByCase = new Map(progressRows.map((p) => [p.caseId, p]));
  const openIssuesByCase = new Map<string, number>();
  for (const e of events ?? []) {
    if (e.eventType === 'issue.created') {
      const id = e.entityId;
      openIssuesByCase.set(id, (openIssuesByCase.get(id) ?? 0) + 1);
    }
  }
  const statuses = new Map<string, BelegStatus>(
    belege.map((b) => [
      b.caseId,
      deriveBelegStatus(progressByCase.get(b.caseId), openIssuesByCase.get(b.caseId) ?? 0),
    ]),
  );
  const ordered = orderBelege(belege);
  const allDone =
    belege.length > 0 && [...statuses.values()].every((s) => isBelegClosed(s));
  const parkedToday = (events ?? []).filter(
    (e) => e.eventType === 'case.parked_by_employee',
  ).length;
  const nextBeleg = collectComplete ? nextOpenBeleg(belege, statuses) : undefined;
  const belegByCaseId = new Map<string, BelegListItem>(belege.map((b) => [b.caseId, b]));
  const workstation = getWorkstation();

  const openBeleg = (caseId: string): void => {
    if (!collectComplete) return;
    navigate(caseProcessPath(caseId));
  };

  return (
    <Box sx={{ p: 2, pb: 18 }}>
      {!isBackendEnabled && demoControlsEnabled ? <DemoControls /> : null}
      <Typography variant="overline" color="text.secondary">
        Dein Karren · {belege.length} Belege{bundle?.bereich ? ` · ${bundle.bereich}` : ''}
      </Typography>
      <Typography variant="h1" gutterBottom>
        {greetingForHour(new Date().getHours())}
        {bundle ? `, ${bundle.employeeName}` : ''}
      </Typography>
      <Typography sx={{ mb: 2 }}>Arbeitsplatz: {workstation?.name ?? '—'}</Typography>

      {parkMsg ? (
        <Alert severity="info" sx={{ mb: 2 }} onClose={() => setParkMsg(undefined)}>
          {parkMsg}
        </Alert>
      ) : parkedToday > 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>
          {parkedToday} Beleg{parkedToday === 1 ? '' : 'e'} geparkt – kommen ins nächste Bündel.
        </Alert>
      ) : null}

      {/* 1 · Ware holen — inline pick list, check off right here (B1/B2). */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
        1 · Ware holen
        {stops.length > 0 ? (
          <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
            {counts.collected}/{counts.total} Plätze
          </Typography>
        ) : null}
      </Typography>
      <Stack spacing={1} sx={{ mb: 1 }}>
        {stops.map((stop, index) => {
          const isDone = collected.has(stop.sequence);
          const stopBelege = stop.caseIds
            .map((id) => belegByCaseId.get(id))
            .filter((b): b is BelegListItem => Boolean(b));
          return (
            <Paper
              key={stop.sequence}
              variant="outlined"
              onClick={() => void toggleStop(stop.sequence)}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: 'pointer',
                borderColor: isDone ? 'success.main' : 'divider',
                bgcolor: isDone ? 'action.hover' : 'background.paper',
              }}
            >
              <Box
                sx={{
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  bgcolor: isDone ? 'success.main' : 'action.selected',
                  color: isDone ? 'common.white' : 'text.primary',
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {isDone ? '✓' : index + 1}
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                {/* B7: Lagerplatz 1:1 aus der Arbeitsanweisung, keine Transformation. */}
                <Typography sx={{ fontWeight: 700, fontSize: 18 }}>{stop.locationCode}</Typography>
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                  {stopBelege.map((b) => (
                    <Chip
                      key={b.caseId}
                      size="small"
                      variant="outlined"
                      // B3: Etiketten-Hinweis NUR wenn gedruckt werden muss.
                      label={`WE ${b.weBelegNo}${b.priceLabelPrintRequired ? ' · 🏷️ Etiketten drucken' : ''}`}
                    />
                  ))}
                </Stack>
              </Box>
              <Chip
                size="small"
                color={isDone ? 'success' : 'default'}
                label={isDone ? 'geholt' : 'offen'}
              />
            </Paper>
          );
        })}
      </Stack>
      {/* B4: Karren voll → Rest (Belege noch nicht geholter Plätze) parken. */}
      {!collectComplete && counts.collected > 0 && uncollectedCaseIds.length > 0 ? (
        <Button size="small" disabled={parking} onClick={() => void handlePark()} sx={{ mb: 1 }}>
          {parking
            ? 'Parken…'
            : `Rest parken (${uncollectedCaseIds.length} Beleg${uncollectedCaseIds.length === 1 ? '' : 'e'})`}
        </Button>
      ) : null}

      {/* 2 · Bearbeiten — the worker freely picks which Beleg first (B8). */}
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, mt: 2 }}>
        2 · Bearbeiten
      </Typography>
      {!collectComplete && belege.length > 0 ? (
        <Alert severity="info" sx={{ mb: 1 }}>
          Erst Ware holen, dann bearbeiten.
        </Alert>
      ) : null}

      <Stack spacing={1}>
        {ordered.map((b) => {
          const st = statuses.get(b.caseId) ?? 'open';
          return (
            <Paper
              key={b.caseId}
              variant="outlined"
              onClick={() => openBeleg(b.caseId)}
              sx={{
                p: 1.5,
                display: 'flex',
                alignItems: 'center',
                gap: 1.5,
                cursor: collectComplete ? 'pointer' : 'not-allowed',
                opacity: collectComplete ? 1 : 0.5,
              }}
            >
              <Box sx={{ fontSize: 22 }}>{ICON[b.goodsType]}</Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {b.storageLocationCode}
                  {/* B5: Teile-Anzahl nur für Hängeware. */}
                  {b.goodsType === 'haengeware' ? ` · ${b.totalQuantity} Teile` : ''}
                </Typography>
              </Box>
              {/* B8: Abschnitt-Semantik (NOS/EB/Vororder/…) zur Selbst-Priorisierung. */}
              {b.goodsTypeText ? (
                <Chip size="small" variant="outlined" label={b.goodsTypeText} />
              ) : null}
              <Chip size="small" color={STATUS_CHIP[st].color} label={STATUS_CHIP[st].label} />
            </Paper>
          );
        })}
      </Stack>

      {belege.length === 0 ? (
        <Alert severity="info">
          Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege hier.
        </Alert>
      ) : null}

      <Box
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
          bgcolor: 'background.paper',
          boxShadow: 8,
        }}
      >
        {allDone ? (
          <Stack spacing={1}>
            <Alert severity="success" sx={{ py: 0.5 }}>
              Bündel fertig 🎉
            </Alert>
            {pullMsg ? (
              <Alert severity="info" sx={{ py: 0.5 }}>
                {pullMsg}
              </Alert>
            ) : null}
            <TouchButton
              emphasis="primary"
              disabled={pulling}
              onClick={() => void handleNextBundle()}
            >
              {pulling ? 'Lädt…' : 'Nächstes Bündel holen'}
            </TouchButton>
          </Stack>
        ) : !collectComplete ? (
          <TouchButton emphasis="primary" disabled>
            {`Erst Ware holen (${counts.collected}/${counts.total})`}
          </TouchButton>
        ) : (
          <TouchButton
            emphasis="primary"
            disabled={!nextBeleg}
            onClick={() => nextBeleg && openBeleg(nextBeleg.caseId)}
          >
            {nextBeleg ? `Start Bearbeitung WE ${nextBeleg.weBelegNo}` : 'Bearbeiten'}
          </TouchButton>
        )}
      </Box>
    </Box>
  );
}

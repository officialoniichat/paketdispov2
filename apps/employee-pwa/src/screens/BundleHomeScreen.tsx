/**
 * Home hub — ONE screen for the whole bundle flow (Dustin B1, überarbeitet nach
 * Kundenfeedback 2026-07-14).
 *
 * Section „1 · Ware holen" lists the route-ordered pick stops inline; checking
 * off (Paket geholt) happens right here — no extra window. Section
 * „2 · Bearbeiten" lists the Belege directly below: WE-Beleg, Filiale,
 * Shopbereich, Etikettendruck/Digitale Etiketten, plus an inline Code-128
 * barcode of the WE-Nr per Beleg (Etiketten per Scanner anfordern). The worker
 * picks the order themselves — every fetched Beleg is directly startable, there
 * is no forced „Start Bearbeitung WE x" sequence anymore. Only per-Beleg
 * fetching gates: a Beleg whose stop is not collected yet stays greyed out.
 * „Rest parken" (B4) sends the Belege of not-yet-fetched stops back to the
 * pool; „Weiteres Bündel anfordern" pulls more work onto the open cart at any
 * time — the decision is the worker's.
 *
 * Data source: `/api/me/today` (`useMeToday`) via React Query — this is the
 * backend's single source of truth. There is no more local Dexie cache: the
 * former `useBundle()`/`db.*` live-queries are gone (see `data/useMeToday.ts`).
 */
import { useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { CaseCardSkeleton, TouchButton } from '@paket/ui';
import { Code128Barcode } from '../components/Code128Barcode.js';
import type { components } from '@paket/api-client';
import { SessionExpiredError } from '../data/apiErrorHandling.js';
import { getSession } from '../data/session.js';
import { useMeToday } from '../data/useMeToday.js';
import { useRequestNextBundle } from '../data/useNextBundle.js';
import { useParkRemaining } from '../data/useParkRemaining.js';
import { useScanner } from '../scanner/useScanner.js';
import { scanMatches } from '../workflow/workflowModel.js';
import type { GoodsCategory } from '../domain/types.js';
import { caseProcessPath } from '../routes/paths.js';

type RouteStopDto = components['schemas']['RouteStopDto'];
type CaseSummaryDto = components['schemas']['CaseSummaryDto'];

export interface CollectStopView extends RouteStopDto {
  caseIds: string[];
}

/**
 * Route stops in pick order, each carrying the Belege booked to its
 * Lagerplatz (matched by `storageLocationCode` — `RouteStopDto` itself has no
 * case linkage). A stop whose only case(s) got parked survives the backend's
 * resequencing (only renumbered, not deleted) but now matches zero cases —
 * filtered out here so it doesn't sit in the list as an uncollectable,
 * pointless "ghost" stop blocking `collectComplete`.
 */
export function deriveStops(routeStops: RouteStopDto[], cases: CaseSummaryDto[]): CollectStopView[] {
  return [...routeStops]
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => ({
      ...stop,
      caseIds: cases.filter((c) => c.storageLocationCode === stop.locationCode).map((c) => c.id),
    }))
    .filter((stop) => stop.caseIds.length > 0);
}

/** German messaging for the backend's "no cart assigned" reasons (§continuation). */
const PULL_REASON_MSG: Record<string, string> = {
  pool_empty: 'Aktuell nichts frei zum Holen.',
  capacity_done: 'Feierabend – Tageskapazität erreicht.',
  shift_ending: 'Schichtende – kein neues Bündel mehr, damit nichts offen liegen bleibt.',
  no_shift: 'Heute keine Schicht eingeplant.',
  skill_tier: 'Belege werden dir von der Teamleitung zugeteilt.',
  continuation: 'Erst den offenen mehrtägigen Beleg fertigstellen.',
  error: 'Konnte nicht laden – bitte später erneut.',
};

type ChipColor = 'default' | 'primary' | 'success' | 'warning' | 'error';

/** Anhang A CaseStatus → the same five visual buckets the old local-progress
 *  derivation produced. The engine/backend now owns status (no more local
 *  CaseProgress derivation). Unknown/pre-assignment statuses fall back to
 *  „Offen" — they should not occur in an employee's own bundle. */
const STATUS_CHIP: Record<string, { label: string; color: ChipColor }> = {
  assigned: { label: 'Offen', color: 'default' },
  ready: { label: 'Offen', color: 'default' },
  in_progress: { label: 'In Arbeit', color: 'primary' },
  completed: { label: 'Fertig', color: 'success' },
  zst_done: { label: 'Fertig', color: 'success' },
  // Problem-Loop (Kundenfeedback 14.07.2026): rot geparkt beim MA (wartet auf
  // Klärung) bzw. grün geklärt (zur Weiterbearbeitung freigegeben).
  issue_open: { label: 'Problem gemeldet', color: 'error' },
  problem_resolved: { label: 'Geklärt', color: 'success' },
};

function statusChipFor(status: string): { label: string; color: ChipColor } {
  return STATUS_CHIP[status] ?? { label: 'Offen', color: 'default' };
}

/** A Beleg needs no more work today once fertig (completed/zst_done). */
function isCaseClosed(status: string): boolean {
  return status === 'completed' || status === 'zst_done';
}

/**
 * Problemfall (Kundenfeedback 14.07.2026): rot geparkt, wartet auf die Klärung
 * durch die Teamleitung — NICHT bearbeitbar, bis er grün zurückkommt.
 */
function isCaseParked(status: string): boolean {
  return status === 'issue_open';
}

/** B6: Icon je Lagerplatz-Art (LocationKind-abgeleitet): Regal / Palette / Kleiderbügel. */
const ICON: Record<GoodsCategory, string> = {
  regal: '🗄️',
  palette: '🟧',
  haengeware: '🧥',
  mixed: '📦',
};

/** Derives the display icon category from the case's storageLocationKind
 *  (CaseSummaryDto), mirroring the old Dexie-derived GoodsCategory mapping. */
function goodsCategoryFor(locationKind: string | null | undefined): GoodsCategory {
  if (locationKind === 'regal') return 'regal';
  if (locationKind === 'haengebahn') return 'haengeware';
  if (locationKind?.startsWith('palette')) return 'palette';
  return 'mixed';
}

/** A3: greeting adapts to the time of day. */
export function greetingForHour(hour: number): string {
  if (hour < 11) return 'Guten Morgen';
  if (hour < 17) return 'Guten Tag';
  return 'Guten Abend';
}

export function BundleHomeScreen(): JSX.Element {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useMeToday();
  const requestNextBundle = useRequestNextBundle();
  const parkRemaining = useParkRemaining();
  const session = getSession();

  // TODO(task-13+): there is no backend mutation yet to persist a "Ware holen"
  // stop check-off (RouteStopDto has no scan-submit endpoint). Until one
  // exists this is a local-only echo of the pick UI, seeded from the route
  // stop's `scanned` flag whenever a *new* bundle is assigned.
  //
  // Tracked by the stop's own `id`, NOT its `sequence`: "Rest parken" causes
  // the backend to resequence every remaining stop (0..n) in the same
  // bundle — the bundle id doesn't change, so a sequence-keyed set would
  // silently point at the wrong stop (or the wrong "geholt" state) after any
  // park action. `id` is stable across that resequencing.
  const [collectedStopIds, setCollectedStopIds] = useState<Set<string>>(new Set());
  const [seededBundleId, setSeededBundleId] = useState<string | undefined>(undefined);
  const [pullMsg, setPullMsg] = useState<string | undefined>(undefined);
  const [parkMsg, setParkMsg] = useState<string | undefined>(undefined);
  // Punkt 3 / Nachtrag 15.07.2026: welcher Beleg seine WE-Nr als Code-128 im
  // Pop-up (Modal) zeigt — kein neuer Tab/Fenster, kein QR.
  const [barcodeCaseId, setBarcodeCaseId] = useState<string | undefined>(undefined);

  const bundle = data?.bundle;
  const cases = data?.cases ?? [];

  useEffect(() => {
    if (bundle && bundle.bundleId !== seededBundleId) {
      const scanned = new Set(bundle.routeStops.filter((stop) => stop.scanned).map((stop) => stop.id));
      setCollectedStopIds(scanned);
      setSeededBundleId(bundle.bundleId);
    }
  }, [bundle, seededBundleId]);

  const collected = collectedStopIds;

  const stops = deriveStops(bundle?.routeStops ?? [], cases);

  const toggleStop = (stopId: string): void => {
    setCollectedStopIds((prev) => {
      const next = new Set(prev);
      if (next.has(stopId)) next.delete(stopId);
      else next.add(stopId);
      return next;
    });
  };

  // Optional scan: a scanned code that matches an unfetched stop checks it off.
  useScanner({
    onScan: (code) => {
      const hit = stops.find((s) => !collected.has(s.id) && scanMatches(code, s.locationCode));
      if (hit) toggleStop(hit.id);
    },
  });

  const counts = { total: stops.length, collected: stops.filter((s) => collected.has(s.id)).length };
  const collectComplete = stops.length === 0 || stops.every((s) => collected.has(s.id));

  // Pull the next cart from the backend. The `['me','today']` query is
  // invalidated by the mutation itself on success, so the home refreshes
  // automatically once the new bundle is assigned.
  const handleNextBundle = async (): Promise<void> => {
    setPullMsg(undefined);
    try {
      const result = await requestNextBundle.mutateAsync();
      if (!result.assigned) {
        setPullMsg(PULL_REASON_MSG[result.reason ?? 'error'] ?? PULL_REASON_MSG.error);
      }
    } catch {
      setPullMsg(PULL_REASON_MSG.error);
    }
  };

  // B4 Parkposition: the Belege of not-yet-fetched stops go back to the pool.
  const uncollectedCaseIds = stops
    .filter((s) => !collected.has(s.id))
    .flatMap((s) => s.caseIds);

  const handlePark = async (): Promise<void> => {
    setParkMsg(undefined);
    try {
      const result = await parkRemaining.mutateAsync({ caseIds: uncollectedCaseIds });
      const parkedCount = result.parkedCaseIds.length;
      setParkMsg(
        `${parkedCount} Beleg${parkedCount === 1 ? '' : 'e'} geparkt – kommen ins nächste Bündel.`,
      );
    } catch (err) {
      setParkMsg(err instanceof Error ? err.message : 'Parken fehlgeschlagen');
    }
  };

  // TODO(task-13+): /api/me/today does not (yet) expose a "parked today"
  // count. The former local event log this read from is gone (Dexie). Kept
  // at 0 rather than deleting the alert branch below — wire this once the
  // backend exposes it.
  const parkedToday: number = 0;

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton count={3} />
      </Box>
    );
  }

  if (isError && !(error instanceof SessionExpiredError)) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => void refetch()}>
              Erneut versuchen
            </Button>
          }
        >
          Verbindung fehlgeschlagen. Bitte erneut versuchen.
        </Alert>
      </Box>
    );
  }

  // `cases` kommt bereits in der Bündel-Reihenfolge der assignment-engine
  // (`AssignmentItem.sequence`, sortiert in `getToday()`). Die UI ordnet nicht
  // selbst um — die Engine entscheidet, der Screen zeigt nur an.
  const ordered = cases;
  // Nachtrag 15.07.2026: der Beleg, dessen WE-Nr aktuell im Barcode-Pop-up steht.
  const barcodeCase = cases.find((c) => c.id === barcodeCaseId);
  // „Alles fertig" ignoriert geparkte Problemfälle: die warten auf den Teamlead,
  // der MA kann sie nicht weiter bearbeiten (Kundenfeedback 14.07.2026, Punkt 10).
  const allDone =
    cases.length > 0 && cases.every((c) => isCaseClosed(c.status) || isCaseParked(c.status));

  // Punkt 4: keine erzwungene Sequenz mehr — jeder GEHOLTE Beleg ist direkt
  // startbar. Nur das Holen selbst gated noch: ein Beleg, dessen Lagerplatz-Stop
  // nicht abgehakt ist, bleibt ausgegraut.
  const uncollectedCaseIdSet = new Set(uncollectedCaseIds);
  const isBelegStartable = (caseId: string): boolean => !uncollectedCaseIdSet.has(caseId);

  const openBeleg = (caseId: string): void => {
    if (!isBelegStartable(caseId)) return;
    const target = cases.find((c) => c.id === caseId);
    // Geparkte Problemfälle sind gesperrt, bis der Teamlead geklärt hat (Punkt 10).
    if (target && isCaseParked(target.status)) return;
    navigate(caseProcessPath(caseId));
  };

  return (
    <Box sx={{ p: 2, pb: 18 }}>
      {/* Feedback: „Dein Karren · N Belege · Bereich" gestrichen — kein Kopf-Overline. */}
      <Typography variant="h1" gutterBottom>
        {greetingForHour(new Date().getHours())}
        {session ? `, ${session.displayName}` : ''}
      </Typography>
      <Typography sx={{ mb: 2 }}>Arbeitsplatz: {data?.workstation?.name ?? '—'}</Typography>

      {!bundle ? (
        <Alert severity="info">
          Kein Bündel zugeteilt. Du kannst unten selbst ein Bündel anfordern oder dich an den
          Teamlead wenden.
        </Alert>
      ) : (
        <>
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
              const isDone = collected.has(stop.id);
              const stopBelege = stop.caseIds
                .map((id) => cases.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => Boolean(c));
              return (
                <Paper
                  key={stop.id}
                  variant="outlined"
                  onClick={() => toggleStop(stop.id)}
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
                          key={b.id}
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
            <Button
              size="small"
              disabled={parkRemaining.isPending}
              onClick={() => void handlePark()}
              sx={{ mb: 1 }}
            >
              {parkRemaining.isPending
                ? 'Parken…'
                : `Rest parken (${uncollectedCaseIds.length} Beleg${uncollectedCaseIds.length === 1 ? '' : 'e'})`}
            </Button>
          ) : null}

          {/* 2 · Bearbeiten — the worker freely picks which fetched Beleg first
              (Punkt 4: no forced sequence; only not-yet-fetched Belege stay greyed). */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, mt: 2 }}>
            2 · Bearbeiten
          </Typography>
          {!collectComplete && cases.length > 0 ? (
            <Alert severity="info" sx={{ mb: 1 }}>
              Ausgegraute Belege erst holen — geholte Belege kannst du in beliebiger
              Reihenfolge starten.
            </Alert>
          ) : null}

          <Stack spacing={1}>
            {ordered.map((b) => {
              const chip = statusChipFor(b.status);
              const parked = isCaseParked(b.status);
              const resolved = b.status === 'problem_resolved';
              // Punkt 10: rot geparkter Problemfall (gesperrt) / grün geklärt (freigegeben).
              const tint = parked
                ? { bgcolor: 'rgba(211, 47, 47, 0.08)', borderColor: 'error.light' }
                : resolved
                  ? { bgcolor: 'rgba(46, 125, 50, 0.08)', borderColor: 'success.light' }
                  : {};
              // Startbar = Ware geholt UND kein geparkter Problemfall.
              const startable = isBelegStartable(b.id) && !parked;
              return (
                <Paper key={b.id} variant="outlined" sx={{ p: 1.5, ...tint }}>
                  <Box
                    onClick={() => openBeleg(b.id)}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      cursor: startable ? 'pointer' : 'not-allowed',
                      opacity: isBelegStartable(b.id) ? 1 : 0.5,
                    }}
                  >
                    <Box sx={{ fontSize: 22 }}>{ICON[goodsCategoryFor(b.storageLocationKind)]}</Box>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      {/* Punkt 2: Anzeige-Reihenfolge WE-Beleg, Filiale, Shopbereich, Etiketten. */}
                      <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                      <Typography variant="body2" color="text.secondary">
                        Filiale {b.branchNo}
                        {b.primaryShopAreaNo ? ` · Shopbereich ${b.primaryShopAreaNo}` : ''}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {b.priceLabelPrintRequired ? '🏷️ Etikettendruck' : 'Digitale Etiketten'}
                      </Typography>
                      {parked ? (
                        <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>
                          Wartet auf Klärung durch die Teamleitung – nicht bearbeitbar.
                        </Typography>
                      ) : null}
                      {resolved ? (
                        <Typography variant="body2" color="success.main" sx={{ fontWeight: 600 }}>
                          Geklärt – zur Weiterbearbeitung freigegeben.
                        </Typography>
                      ) : null}
                    </Box>
                    {/* B8: Abschnitt-Semantik (NOS/EB/Vororder/…) zur Selbst-Priorisierung. */}
                    {b.goodsType ? (
                      <Chip size="small" variant="outlined" label={b.goodsType} />
                    ) : null}
                    <Chip size="small" color={chip.color} label={chip.label} />
                  </Box>
                  {/* Punkt 3 / Nachtrag 15.07.2026: WE-Nr als Code-128 im Pop-up öffnen
                      (Etiketten per Scanner anfordern) — bei JEDEM Beleg, unabhängig von
                      der Etiketten-Pflicht. */}
                  <Button size="small" sx={{ mt: 0.5 }} onClick={() => setBarcodeCaseId(b.id)}>
                    Barcode anzeigen
                  </Button>
                </Paper>
              );
            })}
          </Stack>

          {cases.length === 0 ? (
            <Alert severity="info">
              Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege hier.
            </Alert>
          ) : null}
        </>
      )}

      {/* Punkt 1: „Weiteres Bündel anfordern" — jederzeit möglich, auch mit offenem
          Bündel. Die Entscheidung liegt beim Mitarbeiter; das Backend hängt die
          neuen Belege an das offene Bündel an. */}
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
        <Stack spacing={1}>
          {allDone ? (
            <Alert severity="success" sx={{ py: 0.5 }}>
              Bündel fertig 🎉
            </Alert>
          ) : null}
          {pullMsg ? (
            <Alert severity="info" sx={{ py: 0.5 }} onClose={() => setPullMsg(undefined)}>
              {pullMsg}
            </Alert>
          ) : null}
          <TouchButton
            emphasis="primary"
            disabled={requestNextBundle.isPending}
            onClick={() => void handleNextBundle()}
          >
            {requestNextBundle.isPending
              ? 'Lädt…'
              : !bundle || allDone
                ? 'Nächstes Bündel holen'
                : 'Weiteres Bündel anfordern'}
          </TouchButton>
        </Stack>
      </Box>

      {/* Nachtrag 15.07.2026: WE-Nr als Code-128-Pop-up (Modal in der App) —
          kein neuer Tab/Fenster, kein QR. */}
      <Dialog open={barcodeCase !== undefined} onClose={() => setBarcodeCaseId(undefined)}>
        <DialogTitle>WE {barcodeCase?.weBelegNo}</DialogTitle>
        <DialogContent sx={{ pt: 1 }}>
          {barcodeCase ? <Code128Barcode value={barcodeCase.weBelegNo} /> : null}
          <Button fullWidth sx={{ mt: 2 }} onClick={() => setBarcodeCaseId(undefined)}>
            Schließen
          </Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

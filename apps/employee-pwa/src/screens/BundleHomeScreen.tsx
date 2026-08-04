/**
 * Home hub — ONE screen for the whole bundle flow (Dustin B1, überarbeitet nach
 * Kundenfeedback 2026-07-14).
 *
 * Section „1 · Ware holen" lists the route-ordered pick stops inline; checking
 * off (Paket geholt) happens right here — no extra window. The Haken is
 * persisted per Beleg on the backend (`POST /api/cases/:id/collected`,
 * CaseSummaryDto.collected) — it survives reload, navigation and device
 * switches; tap and Lagerplatz-Scan share that one path (Kundenfeedback
 * 04.08.2026, Punkt 2). Each stop lists its Belege with the same Beleg-Kopf
 * infos as „2 · Bearbeiten" (Filiale, Shopbereich, Etikettendruck/Digitale
 * Etiketten, Warenart, CatMan-Termin) plus „Barcode anzeigen" — the WE-Nr as
 * Code-128 pop-up to request Etiketten per Scanner right while fetching
 * (Kundenfeedback 15.07.2026, Punkte 1+2). Der CatMan-Termin ist der Tag, bis
 * zu dem die Ware auf der Verkaufsfläche stehen muss; ein überschrittener
 * Termin wird rot als „überfällig" markiert. Reine Kontrollinformation — die
 * Bündel-Reihenfolge der assignment-engine bleibt unangetastet, hier wird
 * nichts umsortiert. Section „2 · Bearbeiten" lists the Belege directly below.
 * Fertige Belege (completed/zst_done) verschwinden KOMPLETT aus beiden
 * Abschnitten — die Zähler laufen über alle Belege weiter; sind alle fertig,
 * bleibt nur eine kurze Fertig-Ansicht + der Pull-Button (Kundenfeedback
 * 04.08.2026, Punkt 1). The worker picks the order
 * themselves — every fetched Beleg is directly startable, there is no forced
 * „Start Bearbeitung WE x" sequence anymore. Only per-Beleg fetching gates: a
 * Beleg whose stop is not collected yet stays greyed out. Geparkte Problemfälle
 * („Problem gemeldet", warten auf die Teamleitung) listen immer ganz unten
 * (Kundenfeedback 15.07.2026, Punkt 3).
 * „Rest parken" (B4) sends the Belege of not-yet-fetched stops back to the
 * pool; „Weiteres Bündel anfordern" pulls more work onto the open cart at any
 * time — the decision is the worker's.
 *
 * Data source: `/api/me/today` (`useMeToday`) via React Query — this is the
 * backend's single source of truth. There is no more local Dexie cache: the
 * former `useBundle()`/`db.*` live-queries are gone (see `data/useMeToday.ts`).
 */
import { Fragment, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
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
import type { SvgIconComponent } from '@mui/icons-material';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import {
  LABEL_PRINT_VARIANT_DISPLAY,
  summarizeLabelPrintVariants,
  type LabelPrintVariant,
} from '@paket/domain-types';
import { CaseCardSkeleton, LabelPrintVariantIcon, TouchButton } from '@paket/ui';
import { IssueBadge } from '../components/IssueBadge.js';
import { CatManChip } from '../components/CatManChip.js';
import { Code128Barcode } from '../components/Code128Barcode.js';
import type { components } from '@paket/api-client';
import { SessionExpiredError } from '../data/apiErrorHandling.js';
import { getSession } from '../data/session.js';
import { useMeToday, useReferenceDay } from '../data/useMeToday.js';
import { useRequestNextBundle } from '../data/useNextBundle.js';
import { useParkRemaining } from '../data/useParkRemaining.js';
import { useSetCollected } from '../data/useSetCollected.js';
import { useScanner } from '../scanner/useScanner.js';
import { scanMatches } from '../workflow/workflowModel.js';
import type { GoodsCategory } from '../domain/types.js';
import { caseProcessPath } from '../routes/paths.js';

type RouteStopDto = components['schemas']['RouteStopDto'];
type CaseSummaryDto = components['schemas']['CaseSummaryDto'];

/**
 * Ein Beleg-Container in „1 · Ware holen". `id` ist die Case-Id; der
 * Abhak-Zustand kommt NICHT von hier, sondern persistiert vom Case selbst
 * (`CaseSummaryDto.collected`).
 */
export interface CollectStopView {
  id: string;
  sequence: number;
  locationCode: string;
  caseIds: string[];
}

/**
 * Pick list für „1 · Ware holen": EIN Container je BELEG (Kundenwunsch
 * 29.07.2026) — Belege werden einzeln geholt und abgehakt, auch wenn mehrere
 * auf demselben Lagerplatz liegen (z. B. eine zusammengehörige Lieferung),
 * denn bearbeitet wird ohnehin ein Beleg nach dem anderen. Die Reihenfolge
 * bleibt die Engine-Route: Container folgen der `routeStops`-Sequenz ihres
 * Lagerplatzes, innerhalb desselben Lagerplatzes der Bündel-Reihenfolge.
 * Die Belege selbst sind die Wahrheit darüber, was geholt werden muss —
 * fehlen `routeStops` (z. B. manuell zugewiesenes / nachgezogenes Bündel ohne
 * Routen-Neuberechnung), bleibt die Liste trotzdem vollständig statt „weirdly
 * leer" (Nachtrag 15.07.2026). `id` ist die Case-Id: eindeutig je Container
 * und stabil über das Backend-Resequencing nach „Rest parken".
 */
export function deriveStops(
  routeStops: RouteStopDto[],
  cases: CaseSummaryDto[],
): CollectStopView[] {
  const metaByLocation = new Map(routeStops.map((stop) => [stop.locationCode, stop]));
  const entries: Array<{ c: CaseSummaryDto; loc: string; seq: number }> = [];
  for (const c of cases) {
    const loc = c.storageLocationCode;
    if (!loc) continue;
    entries.push({ c, loc, seq: metaByLocation.get(loc)?.sequence ?? Number.MAX_SAFE_INTEGER });
  }
  // Stabiler Sort: gleiche Sequenz (= derselbe Lagerplatz) behält die Bündel-Reihenfolge.
  return entries
    .sort((a, b) => a.seq - b.seq || a.loc.localeCompare(b.loc))
    .map(({ c, loc }, index) => ({
      id: c.id,
      sequence: index + 1,
      locationCode: loc,
      caseIds: [c.id],
    }));
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

/**
 * A Beleg needs no more work today once fertig (completed/zst_done) — und
 * verschwindet dann KOMPLETT aus beiden Abschnitten (Kundenfeedback 04.08.2026:
 * „der MA benötigt diesen nicht mehr", sonst wird der Bildschirm unübersichtlich).
 * Reine Anzeige-Ableitung aus dem Engine-/Backend-Status — kein eigener Zustand.
 */
export function isCaseClosed(status: string): boolean {
  return status === 'completed' || status === 'zst_done';
}

/**
 * Problemfall (Kundenfeedback 14.07.2026): rot geparkt, wartet auf die Klärung
 * durch die Teamleitung — NICHT bearbeitbar, bis er grün zurückkommt.
 */
function isCaseParked(status: string): boolean {
  return status === 'issue_open';
}

/**
 * Anzeige-Regel für „2 · Bearbeiten": Grundlage bleibt die Bündel-Reihenfolge
 * der assignment-engine (`AssignmentItem.sequence`, sortiert in `getToday()`) —
 * die UI ordnet fachlich nicht um. Obendrauf nur zwei Anzeige-Regeln:
 *
 * 1. Fertige Belege (completed/zst_done) werden NICHT mehr gelistet
 *    (Kundenfeedback 04.08.2026, Punkt 1) — sie zählen in den Zählern weiter
 *    mit. Problemfälle (issue_open) und Geklärte (problem_resolved) sind
 *    fachlich NICHT fertig und bleiben sichtbar (Problem-Loop).
 * 2. Geparkte Problemfälle („Problem gemeldet", warten auf Klärung durch die
 *    Teamleitung, nicht bearbeitbar) stehen immer ganz unten (Kundenfeedback
 *    15.07.2026, Punkt 3). Stabile Partition: innerhalb beider Gruppen bleibt
 *    die Engine-Reihenfolge unangetastet.
 */
export function casesForDisplay(cases: readonly CaseSummaryDto[]): CaseSummaryDto[] {
  const open = cases.filter((c) => !isCaseClosed(c.status));
  return [
    ...open.filter((c) => !isCaseParked(c.status)),
    ...open.filter((c) => isCaseParked(c.status)),
  ];
}

/** B6: Icon je Lagerplatz-Art (LocationKind-abgeleitet): Regal / Palette / Kleiderbügel. */
const ICON: Record<GoodsCategory, SvgIconComponent> = {
  regal: GridViewOutlinedIcon,
  palette: LayersOutlinedIcon,
  haengeware: CheckroomOutlinedIcon,
  mixed: Inventory2OutlinedIcon,
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

/**
 * Welche Etikett-Druckvarianten stecken in diesem Beleg — nur die tatsächlich
 * vorkommenden, in der Reihenfolge aus domain-types (Kundenfeedback 03.08.2026).
 * Die Fachlogik liegt in `summarizeLabelPrintVariants`; hier wird nur gelesen.
 */
function belegLabelVariants(beleg: CaseSummaryDto): LabelPrintVariant[] {
  return summarizeLabelPrintVariants(
    (beleg.labelPrintPositions ?? []).map((p) => p.labelPrintVariant),
  );
}

/**
 * Aufdröselung PRO POSITION unter dem Code-128 (Kundenfeedback 03.08.2026): an der
 * Etikettendruck-Station muss auf einen Blick sichtbar sein, WELCHE Position ohne
 * Preis zu drucken ist — sonst laufen alle Etiketten mit Preis. Reihenfolge =
 * Positionsreihenfolge, untereinander, klar getrennte Zeilen fürs Handy.
 */
const VARIANT_ROW_SX: Record<LabelPrintVariant, { bgcolor: string; borderColor: string }> = {
  etikett_mit_preis: { bgcolor: 'action.hover', borderColor: 'divider' },
  digitag_etikett_ohne_preis: {
    bgcolor: 'rgba(156, 39, 176, 0.10)',
    borderColor: 'secondary.light',
  },
  kein_etikett: { bgcolor: 'transparent', borderColor: 'divider' },
};

function BarcodeLabelBreakdown({ beleg }: { beleg: CaseSummaryDto }): JSX.Element | null {
  const positions = beleg.labelPrintPositions ?? [];
  if (positions.length === 0) return null;
  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
        Etikettendruck je Position
      </Typography>
      <Stack spacing={0.75}>
        {positions.map((p) => {
          const display = LABEL_PRINT_VARIANT_DISPLAY[p.labelPrintVariant];
          return (
            <Box
              key={p.positionNo}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1.25,
                p: 1,
                borderRadius: 1,
                border: '1px solid',
                ...VARIANT_ROW_SX[p.labelPrintVariant],
              }}
            >
              <Typography sx={{ fontWeight: 800, fontSize: 17, minWidth: 62, flexShrink: 0 }}>
                Pos {p.positionNo}
              </Typography>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Stack direction="row" alignItems="center" spacing={0.75}>
                  <LabelPrintVariantIcon variant={p.labelPrintVariant} fontSize="small" />
                  <Typography sx={{ fontWeight: 700, lineHeight: 1.25 }}>
                    {display.label}
                  </Typography>
                </Stack>
                <Typography variant="body2" color="text.secondary" noWrap>
                  {p.supplierArticleNo}
                  {p.supplierColor ? ` · ${p.supplierColor}` : ''}
                </Typography>
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}

/**
 * Beleg-Kopf-Infos (Filiale · Shopbereich, Etiketten-Art, CatMan-Termin) —
 * identisch unter „1 · Ware holen" und „2 · Bearbeiten" (Kundenfeedback
 * 15.07.2026, Punkt 1: die Zusatz-Infos stehen auch am Ware-holen-Eintrag des
 * Belegs). EINE Zeile, die Blöcke mit „|" getrennt (Nachtrag 17.07.2026).
 *
 * Die Etiketten-Angabe nennt seit dem Kundenfeedback 03.08.2026 die konkreten
 * Varianten des Belegs statt eines pauschalen „Etikettendruck / Digitale
 * Etiketten": digital ausgezeichnete Ware wird ebenfalls gedruckt — nur ohne
 * Preis, und genau das muss der Mitarbeiter am Drucker einstellen.
 *
 * Der CatMan-Termin (Kundenfeedback: „Das Datum vom CatMan-Termin muss angezeigt
 * werden") steht als Chip daneben, sobald der Beleg einen trägt — ein
 * überschrittener Termin rot als „überfällig". Reine Kontrollinformation: die
 * Reihenfolge der Belege bleibt die der assignment-engine.
 */
function BelegInfoLine({
  beleg,
  referenceDay,
}: {
  beleg: CaseSummaryDto;
  referenceDay: string;
}): JSX.Element {
  const variants = belegLabelVariants(beleg);
  return (
    <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
      {/* EINE fließende Zeile, Blöcke mit „|" getrennt (Nachtrag 17.07.2026).
          Das Symbol sitzt als Inline-Icon IM Textfluss (kein eigener Flex-Block):
          nur so bricht die Zeile in schmalen Karten weiter wie normaler Text —
          ein Flex-Block würde auf Wortbreite schrumpfen und „Etikett mit Preis"
          Wort für Wort untereinander stapeln. */}
      <Typography variant="body2" color="text.secondary">
        Filiale {beleg.branchNo}
        {beleg.primaryShopAreaNo ? ` · Shopbereich ${beleg.primaryShopAreaNo}` : ''}
        {variants.map((v) => (
          <Fragment key={v}>
            {' | '}
            <LabelPrintVariantIcon
              variant={v}
              sx={{ fontSize: 16, verticalAlign: 'text-bottom', mr: 0.25 }}
            />
            {LABEL_PRINT_VARIANT_DISPLAY[v].shortLabel}
          </Fragment>
        ))}
      </Typography>
      <CatManChip date={beleg.catManDate} referenceDay={referenceDay} />
    </Stack>
  );
}

export function BundleHomeScreen(): JSX.Element {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch } = useMeToday();
  const requestNextBundle = useRequestNextBundle();
  const parkRemaining = useParkRemaining();
  const session = getSession();
  // Bezugstag der Überfälligkeits-Anzeige: der Server-Tag dieses Bündels.
  const referenceDay = useReferenceDay();

  const setCollected = useSetCollected();
  const [pullMsg, setPullMsg] = useState<string | undefined>(undefined);
  const [parkMsg, setParkMsg] = useState<string | undefined>(undefined);
  // Punkt 3 / Nachtrag 15.07.2026: welcher Beleg seine WE-Nr als Code-128 im
  // Pop-up (Modal) zeigt — kein neuer Tab/Fenster, kein QR.
  const [barcodeCaseId, setBarcodeCaseId] = useState<string | undefined>(undefined);

  const bundle = data?.bundle;
  const cases = data?.cases ?? [];

  // Ware-holen-Zustand (B2) kommt persistiert vom Backend (CaseSummaryDto
  // .collected, je Beleg-Container = Case-Id) — kein lokales Echo mehr, der
  // Haken überlebt Reload, Navigation und Gerätewechsel. Fertige Belege
  // zählen immer als geholt (bearbeitet wurde nur, was auf dem Karren lag),
  // damit die Zähler korrekt bleiben, obwohl ihre Container nicht mehr
  // gelistet werden.
  const closedIds = new Set(cases.filter((c) => isCaseClosed(c.status)).map((c) => c.id));
  const collectedIds = new Set(
    cases.filter((c) => c.collected === true || isCaseClosed(c.status)).map((c) => c.id),
  );

  // ALLE Container (auch die fertiger Belege) bilden die Zähler-Basis;
  // gelistet werden nur die offenen (Kundenfeedback 04.08.2026: fertig = raus).
  const stops = deriveStops(bundle?.routeStops ?? [], cases);
  const openStops = stops.filter((s) => !closedIds.has(s.id));

  const toggleStop = (stopId: string): void => {
    setCollected.mutate({ caseId: stopId, collected: !collectedIds.has(stopId) });
  };

  // Optional scan: a scanned code that matches an unfetched stop checks it off —
  // über DENSELBEN Persistenz-Weg wie der Tipp (kein lokaler Sonderpfad).
  useScanner({
    onScan: (code) => {
      const hit = openStops.find(
        (s) => !collectedIds.has(s.id) && scanMatches(code, s.locationCode),
      );
      if (hit) setCollected.mutate({ caseId: hit.id, collected: true });
    },
  });

  const counts = {
    total: stops.length,
    collected: stops.filter((s) => collectedIds.has(s.id)).length,
  };
  const collectComplete = stops.length === 0 || stops.every((s) => collectedIds.has(s.id));

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
    .filter((s) => !collectedIds.has(s.id))
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

  // `cases` kommt bereits in der Bündel-Reihenfolge der assignment-engine —
  // obendrauf nur die Anzeige-Regeln aus `casesForDisplay` (fertig = raus,
  // geparkte Problemfälle ganz unten).
  const visibleCases = casesForDisplay(cases);
  // Nachtrag 15.07.2026: der Beleg, dessen WE-Nr aktuell im Barcode-Pop-up steht.
  const barcodeCase = cases.find((c) => c.id === barcodeCaseId);
  // „Alles fertig" ignoriert geparkte Problemfälle: die warten auf den Teamlead,
  // der MA kann sie nicht weiter bearbeiten (Kundenfeedback 14.07.2026, Punkt 10).
  const allDone =
    cases.length > 0 && cases.every((c) => isCaseClosed(c.status) || isCaseParked(c.status));
  // WIRKLICH alles fertig (completed/zst_done): beide Abschnitte wären leer —
  // stattdessen die kurze Fertig-Ansicht zeigen (Kundenfeedback 04.08.2026).
  // Solange Problemfälle/Geklärte übrig sind, bleiben die Abschnitte stehen.
  const allClosed = cases.length > 0 && cases.every((c) => isCaseClosed(c.status));

  // Punkt 4: keine erzwungene Sequenz mehr — jeder GEHOLTE Beleg ist direkt
  // startbar. Nur das Holen selbst gated noch: ein Beleg, dessen Lagerplatz-Stop
  // nicht abgehakt ist, bleibt ausgegraut.
  const uncollectedCaseIdSet = new Set(uncollectedCaseIds);
  const isBelegStartable = (caseId: string): boolean => !uncollectedCaseIdSet.has(caseId);

  const openBeleg = (caseId: string): void => {
    if (!isBelegStartable(caseId)) return;
    // Geparkte Problemfälle (issue_open) öffnen als NUR-ANSICHT (Instruktions-
    // Loop 04.08.2026): der MA sieht dort die TL-Hinweis-Blöcke an den
    // betroffenen Positionen — auch bei erst teilweise instruierten Meldungen.
    // Die Sperre selbst („nicht bearbeitbar") erzwingt der BelegProcessScreen.
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

          {allClosed ? (
            /* Fertig-Ansicht (Kundenfeedback 04.08.2026, Punkt 1): alle Belege
               des Bündels sind erledigt — statt leerer Abschnitte eine kurze,
               aufgeräumte Bestätigung. Das nächste Bündel kommt weiterhin über
               den bestehenden Pull-Button unten (keine neue Mechanik). */
            <Paper variant="outlined" sx={{ p: 4, textAlign: 'center' }}>
              <CheckCircleOutlineIcon color="success" sx={{ fontSize: 56 }} />
              <Typography variant="h6" sx={{ fontWeight: 700, mt: 1 }}>
                Alle Belege erledigt
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {cases.length}/{cases.length} erledigt — hol dir unten das nächste Bündel.
              </Typography>
            </Paper>
          ) : (
            <>
              {/* 1 · Ware holen — inline pick list, check off right here (B1/B2).
                  Container fertiger Belege sind ausgeblendet (fertig = raus), die
                  Zähler laufen über ALLE Belege weiter. */}
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                1 · Ware holen
                {stops.length > 0 ? (
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {counts.collected}/{counts.total} Belege
                  </Typography>
                ) : null}
              </Typography>
              <Stack spacing={1} sx={{ mb: 1 }}>
                {openStops.map((stop, index) => {
                  const isDone = collectedIds.has(stop.id);
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
                        {isDone ? <CheckIcon fontSize="small" /> : index + 1}
                      </Box>
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* B7: Lagerplatz 1:1 aus der Arbeitsanweisung, keine Transformation. */}
                        <Typography sx={{ fontWeight: 700, fontSize: 18 }}>
                          {stop.locationCode}
                        </Typography>
                        {/* Kundenfeedback 15.07.2026, Punkte 1+2: je Beleg dieselben
                            Kopf-Infos wie unter „2 · Bearbeiten" plus „Barcode anzeigen"
                            (WE-Nr als Code-128-Pop-up) direkt beim Holen. */}
                        <Stack spacing={1} sx={{ mt: 0.5 }}>
                          {stopBelege.map((b) => (
                            <Box key={b.id}>
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                                {/* B8: Abschnitt-Semantik (NOS/EB/Vororder/…) zur Selbst-Priorisierung. */}
                                {b.goodsType ? (
                                  <Chip size="small" variant="outlined" label={b.goodsType} />
                                ) : null}
                              </Stack>
                              <BelegInfoLine beleg={b} referenceDay={referenceDay} />
                              <Button
                                size="small"
                                onClick={(event) => {
                                  // Der Button liegt in der abhakbaren Stop-Zeile — der
                                  // Klick darf den Stop nicht auf „geholt" togglen.
                                  event.stopPropagation();
                                  setBarcodeCaseId(b.id);
                                }}
                              >
                                Barcode anzeigen
                              </Button>
                            </Box>
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
              {/* B4: Karren voll → Rest (noch nicht geholte Belege) parken. */}
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
                  (Punkt 4: no forced sequence; only not-yet-fetched Belege stay greyed).
                  Fertige Belege sind ausgeblendet; der Zähler nimmt sie weiter mit. */}
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, mt: 2 }}>
                2 · Bearbeiten
                {cases.length > 0 ? (
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    {closedIds.size}/{cases.length} erledigt
                  </Typography>
                ) : null}
              </Typography>
              {!collectComplete && cases.length > 0 ? (
                <Alert severity="info" sx={{ mb: 1 }}>
                  Ausgegraute Belege erst holen — geholte Belege kannst du in beliebiger
                  Reihenfolge starten.
                </Alert>
              ) : null}

              <Stack spacing={1}>
                {visibleCases.map((b) => {
                  const chip = statusChipFor(b.status);
                  const parked = isCaseParked(b.status);
                  const resolved = b.status === 'problem_resolved';
                  // Punkt 10: rot geparkter Problemfall (gesperrt) / grün geklärt (freigegeben).
                  const tint = parked
                    ? { bgcolor: 'rgba(211, 47, 47, 0.08)', borderColor: 'error.light' }
                    : resolved
                      ? { bgcolor: 'rgba(46, 125, 50, 0.08)', borderColor: 'success.light' }
                      : {};
                  // Antippbar, sobald die Ware geholt ist — geparkte Problemfälle
                  // öffnen als Nur-Ansicht (TL-Hinweise je Position einsehbar).
                  const startable = isBelegStartable(b.id);
                  const CategoryIcon = ICON[goodsCategoryFor(b.storageLocationKind)];
                  return (
                    <Paper
                      key={b.id}
                      variant="outlined"
                      onClick={() => openBeleg(b.id)}
                      sx={{
                        p: 1.5,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 1.5,
                        cursor: startable ? 'pointer' : 'not-allowed',
                        opacity: isBelegStartable(b.id) ? 1 : 0.5,
                        ...tint,
                      }}
                    >
                      {(b.issues?.length ?? 0) > 0 ? (
                        /* Zähler-Badge statt Symbol (04.08.2026): „nx" = Anzahl der
                           Meldungen; Tap/Hover öffnet das Meldungs-Popover. */
                        <IssueBadge issues={b.issues ?? []} />
                      ) : (
                        <CategoryIcon sx={{ fontSize: 26, color: 'text.secondary' }} />
                      )}
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        {/* Punkt 2: Anzeige-Reihenfolge WE-Beleg, Filiale, Shopbereich, Etiketten. */}
                        <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                        <BelegInfoLine beleg={b} referenceDay={referenceDay} />
                        {parked ? (
                          <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>
                            Wartet auf Klärung durch die Teamleitung – nicht bearbeitbar. Antippen
                            zeigt die Meldungen und TL-Hinweise.
                          </Typography>
                        ) : null}
                        {resolved ? (
                          <Typography
                            variant="body2"
                            color="success.main"
                            sx={{ fontWeight: 600 }}
                          >
                            Geklärt – zur Weiterbearbeitung freigegeben.
                          </Typography>
                        ) : null}
                      </Box>
                      {/* B8: Abschnitt-Semantik (NOS/EB/Vororder/…) zur Selbst-Priorisierung. */}
                      {b.goodsType ? (
                        <Chip size="small" variant="outlined" label={b.goodsType} />
                      ) : null}
                      <Chip size="small" color={chip.color} label={chip.label} />
                    </Paper>
                  );
                })}
              </Stack>

              {cases.length === 0 ? (
                <Alert severity="info">
                  Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege
                  hier.
                </Alert>
              ) : null}
            </>
          )}
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
          {/* Bei allClosed sagt es bereits die Fertig-Ansicht oben — kein zweites
              Banner. Bleiben nur geparkte Problemfälle übrig, meldet das Banner,
              dass der eigene Teil getan ist. */}
          {allDone && !allClosed ? (
            <Alert
              severity="success"
              icon={<CelebrationOutlinedIcon fontSize="inherit" />}
              sx={{ py: 0.5 }}
            >
              Bündel fertig
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
          {/* Kundenfeedback 03.08.2026: unter dem Code welche Position mit / ohne
              Preis bzw. gar nicht zu drucken ist — direkt an der Druckstation lesbar. */}
          {barcodeCase ? <BarcodeLabelBreakdown beleg={barcodeCase} /> : null}
          <Button fullWidth sx={{ mt: 2 }} onClick={() => setBarcodeCaseId(undefined)}>
            Schließen
          </Button>
        </DialogContent>
      </Dialog>
    </Box>
  );
}

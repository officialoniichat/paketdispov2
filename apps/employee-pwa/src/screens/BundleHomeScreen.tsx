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
 * infos as „2 · Bearbeiten" (Filiale, Shopbereich, Kartons, Etikettendruck/
 * Digitale Etiketten, Warenart, CatMan-Termin) plus „Barcode anzeigen" — the WE-Nr as
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
 * Beleg whose stop is not collected yet stays greyed out. Belege mit noch
 * OFFENER Meldung (warten auf die Teamleitung, nicht bearbeitbar) listen immer
 * ganz unten (Kundenfeedback 15.07.2026, Punkt 3); ein Beleg, dessen Meldungen
 * ALLE instruiert sind, steht umgekehrt ganz OBEN, damit er sofort ins Auge
 * fällt und schnell abgeschlossen werden kann (Kundenfeedback 05.08.2026).
 * Beides ist reine Anzeige-Sortierung aus der vorhandenen Meldungslage
 * (`displayRank`), in beiden Abschnitten gleich — die Engine-Reihenfolge und
 * jede Statuswahrheit bleiben unangetastet.
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
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { SvgIconComponent } from '@mui/icons-material';
import CelebrationOutlinedIcon from '@mui/icons-material/CelebrationOutlined';
import CheckIcon from '@mui/icons-material/Check';
import CheckroomOutlinedIcon from '@mui/icons-material/CheckroomOutlined';
import GridViewOutlinedIcon from '@mui/icons-material/GridViewOutlined';
import GroupsIcon from '@mui/icons-material/Groups';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { TeilenIcon } from '../components/TeilenIcon.js';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import {
  LABEL_PRINT_VARIANT_DISPLAY,
  summarizeLabelPrintVariants,
  type LabelPrintVariant,
} from '@paket/domain-types';
import { CaseCardSkeleton, LabelPrintVariantIcon, TouchButton, ltColors } from '@paket/ui';
import { IssueBadge } from '../components/IssueBadge.js';
import { CatManChip } from '../components/CatManChip.js';
import { Code128Barcode } from '../components/Code128Barcode.js';
import { TeilenDialog } from '../components/TeilenDialog.js';
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
  // Pull-Prinzip: im laufenden Pack ist noch Arbeit, die der MA selbst erledigen
  // kann. Belege, die auf die Teamleitung warten, halten ihn NICHT auf — das
  // entscheidet das Backend (`pack-window.ts`), hier steht nur der Text dazu.
  pack_open: 'Erst das laufende Pack abarbeiten – Belege mit offener Meldung zählen nicht.',
  pool_empty: 'Aktuell nichts frei zum Holen.',
  capacity_done: 'Feierabend – Tageskapazität erreicht.',
  shift_ending: 'Schichtende – kein neues Bündel mehr, damit nichts offen liegen bleibt.',
  no_shift: 'Heute keine Schicht eingeplant.',
  skill_tier: 'Belege werden dir von der Teamleitung zugeteilt.',
  continuation: 'Erst den offenen mehrtägigen Beleg fertigstellen.',
  // Admin-Regel „Beim geteilten Beleg erst mithelfen" (Zusammenarbeit §5.4):
  // gilt für Inhaber UND Helfer, solange am geteilten Beleg Positionen offen sind.
  shared_case_open: 'Erst den geteilten Beleg zu Ende bringen – es sind noch Positionen offen.',
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
 * Teilen-Symbol nur an Belegen, die das Backend zum Einladen zulässt
 * (`assigned|in_progress|problem_resolved`, Zusammenarbeit §7) — ein rot
 * geparkter Problemfall (issue_open) trägt keins (A7). Reine Sichtbarkeits-
 * Spiegelung; die Regel selbst erzwingt der Server (409).
 */
function istTeilbar(status: string): boolean {
  return status === 'assigned' || status === 'in_progress' || status === 'problem_resolved';
}

/** Anzeige-Daten der goldenen „geteilt"-Kennzeichnung einer Beleg-Karte. */
export interface GeteiltInfo {
  /** `'Geteilt mit <Name>'` bei genau einer anderen Person, sonst `'Geteilt · <n> Personen'`. */
  label: string;
  /** Geprüfte Positionen (alle Beteiligten zusammen). */
  geprueft: number;
  /** Positionen des Belegs gesamt. */
  gesamt: number;
}

/**
 * Geteilter Beleg (Zusammenarbeit 31.08.2026): golden markiert wird eine Karte
 * erst, wenn neben MIR mindestens ein weiterer AKTIVER Beteiligter existiert —
 * aktiv sind `angenommen` und `teil_erledigt` (Konzept §6); bloß Eingeladene
 * oder Abgelehnte teilen (noch) nichts. Reine Anzeige-Ableitung aus dem
 * Backend-DTO, keine eigene Fachlogik.
 */
export function geteiltInfo(
  beleg: Pick<CaseSummaryDto, 'collaboration'>,
  meineEmployeeNo: string | undefined,
): GeteiltInfo | null {
  const collab = beleg.collaboration;
  if (collab === undefined || collab === null) return null;
  const aktive = collab.participants.filter(
    (p) => p.status === 'angenommen' || p.status === 'teil_erledigt',
  );
  const andere = aktive.filter((p) => p.employeeNo !== meineEmployeeNo);
  const erste = andere[0];
  if (erste === undefined) return null;
  const label =
    andere.length === 1
      ? `Geteilt mit ${erste.displayName}`
      : `Geteilt · ${aktive.length} Personen`;
  return { label, geprueft: collab.confirmedPositionCount, gesamt: collab.positionCount };
}

/** Goldene Kennzeichnung (ltColors.shared) — nie Farbe allein: immer GroupsIcon + Text (E.6). */
const GETEILT_CHIP_SX = {
  bgcolor: ltColors.shared,
  color: 'common.white',
  fontWeight: 700,
  '& .MuiChip-icon': { color: 'inherit' },
} as const;

/**
 * Eine Meldung wartet auf die Teamleitung, solange ihr Einzel-Status `open` ist
 * (Instruktions-Loop 04.08.2026); `instruction_sent` heißt: der Teamlead hat
 * GENAU diese Meldung mit einer Handlungsanweisung beantwortet.
 */
function isIssueOpen(issue: { status: string }): boolean {
  return issue.status === 'open';
}

/**
 * Wird an diesem Beleg gerade GEMEINSAM gearbeitet? Maßgeblich sind aktive
 * HELFER (`angenommen`/`teil_erledigt`): die Inhaber-Zeile allein ist keine
 * Zusammenarbeit — sie bleibt stehen, auch wenn der letzte Helfer entfernt
 * wurde. Aus Sicht des Inhabers ist genau das „ich habe Mithilfe angefordert
 * und jemand hilft".
 */
export function wirdGeteiltBearbeitet(beleg: Pick<CaseSummaryDto, 'collaboration'>): boolean {
  return (beleg.collaboration?.participants ?? []).some(
    (p) => p.role === 'helfer' && (p.status === 'angenommen' || p.status === 'teil_erledigt'),
  );
}

/**
 * Anzeige-Rang eines Belegs (Kundenfeedback 05.08.2026) — reine Ableitung aus
 * dem vorhandenen Meldungs-/Case-Status. Kein eigener Zustand, keine
 * Statusänderung, kein Umsortieren/Resequencing im Backend: die
 * Engine-Reihenfolge bleibt die Grundlage.
 *
 * Maßgeblich sind die INSTRUKTIONEN, nicht ein Status-Wort: seit dem
 * Instruktions-Loop beantwortet der Teamlead jede Meldung einzeln, und ein
 * Beleg mit teils instruierten, teils offenen Meldungen bleibt gesperrt.
 *
 *   -2 Geteilter Beleg mit aktiver Mithilfe → GANZ nach oben (Kundenwunsch
 *      01.09.2026). Beim Helfer steht der Beleg ohnehin oben; beim Inhaber soll
 *      er es auch, denn an ihm hängt jemand anders. Ein Beleg, der auf die
 *      Teamleitung wartet, bleibt trotzdem unten — daran kann NIEMAND arbeiten.
 *   -1 Alle Meldungen instruiert → der Beleg ist wieder bearbeitbar. Ganz nach
 *      OBEN, damit er dem MA sofort ins Auge fällt und schnell abgeschlossen
 *      werden kann — gerade bei vielen kleinen Belegen. Er bleibt oben, bis er
 *      fertig ist (fertig = raus), sonst verlöre ihn der MA beim Fortsetzen
 *      wieder aus dem Blick.
 *    0 Belege ohne Meldung → Engine-Reihenfolge unangetastet.
 *   +1 Mindestens eine Meldung noch offen → wartet auf die Teamleitung, nicht
 *      bearbeitbar. Ganz nach UNTEN (Kundenfeedback 15.07.2026, Punkt 3). Das
 *      greift auch bei TEILWEISE instruierten Belegen und wieder, sobald eine
 *      MA-Rückmeldung eine Meldung erneut öffnet.
 *
 * `issue_open`/`problem_resolved` sind die Case-seitige Ableitung genau dieser
 * Meldungslage (Backend: `teamlead.service.sendInstruction` kippt den Beleg
 * erst auf `problem_resolved`, wenn keine Meldung mehr offen ist). Sie bleiben
 * hier als Fallback stehen — schlanke DTO-Listen liefern `issues` nicht mit.
 */
function displayRank(
  beleg: Pick<CaseSummaryDto, 'status' | 'issues' | 'collaboration'>,
): -2 | -1 | 0 | 1 {
  const issues = beleg.issues ?? [];
  if (isCaseParked(beleg.status) || issues.some(isIssueOpen)) return 1;
  if (wirdGeteiltBearbeitet(beleg)) return -2;
  if (beleg.status === 'problem_resolved' || issues.length > 0) return -1;
  return 0;
}

/** Die Ränge von `displayRank`, von oben nach unten. */
const DISPLAY_RANKS = [-2, -1, 0, 1] as const;

/**
 * Stabile Partition nach `displayRank`: innerhalb jeder Gruppe bleibt die
 * übergebene Reihenfolge (Bündel- bzw. Routen-Reihenfolge der Engine) exakt
 * erhalten.
 */
function byDisplayRank<T>(items: readonly T[], rankOf: (item: T) => -2 | -1 | 0 | 1): T[] {
  return DISPLAY_RANKS.flatMap((rank) => items.filter((i) => rankOf(i) === rank));
}

/**
 * Anzeige-Regel für „2 · Bearbeiten": Grundlage bleibt die Bündel-Reihenfolge
 * der assignment-engine (`AssignmentItem.sequence`, sortiert in `getToday()`) —
 * die UI ordnet fachlich nicht um. Obendrauf nur zwei Anzeige-Regeln:
 *
 * 1. Fertige Belege (completed/zst_done) werden NICHT mehr gelistet
 *    (Kundenfeedback 04.08.2026, Punkt 1) — sie zählen in den Zählern weiter
 *    mit. Belege mit Meldungen sind fachlich NICHT fertig und bleiben sichtbar.
 * 2. Reihenfolge nach `displayRank`: vollständig instruierte Belege ganz oben,
 *    Belege mit offener Meldung ganz unten, alles dazwischen unverändert in
 *    Engine-Reihenfolge.
 */
export function casesForDisplay(cases: readonly CaseSummaryDto[]): CaseSummaryDto[] {
  return byDisplayRank(
    cases.filter((c) => !isCaseClosed(c.status)),
    displayRank,
  );
}

/**
 * Anzeige-Regel für „1 · Ware holen" — dieselbe Container-Reihenfolge wie unter
 * „2 · Bearbeiten" (Kundenfeedback 05.08.2026): hat ein instruierter Beleg hier
 * noch einen Abhol-Stopp, darf ihn dieser Abschnitt nicht widersprüchlich weit
 * unten einsortieren. Grundlage bleibt die Engine-Route aus `deriveStops`,
 * darüber nur `displayRank`; Container fertiger Belege verschwinden komplett
 * (Kundenfeedback 04.08.2026, Punkt 1).
 */
export function stopsForDisplay(
  stops: readonly CollectStopView[],
  cases: readonly CaseSummaryDto[],
): CollectStopView[] {
  // Container ohne Case gibt es nicht — `deriveStops` baut sie AUS den Cases.
  const caseById = new Map(cases.map((c) => [c.id, c]));
  return byDisplayRank(
    stops.filter((s) => {
      const beleg = caseById.get(s.id);
      return beleg === undefined || !isCaseClosed(beleg.status);
    }),
    (s) => {
      const beleg = caseById.get(s.id);
      return beleg ? displayRank(beleg) : 0;
    },
  );
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
 * Beleg-Kopf-Infos (Filiale · Shopbereich, Kartons, Etiketten-Art, CatMan-Termin) —
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
  // Kartons der Anlieferung — NUR wenn es mehr als einer ist. Auf dem Lagerplatz
  // stehen auch Kartons anderer Aufträge; der Mitarbeiter erkennt seine an der
  // WE-Nummer, weiß aber nicht, wann er vollständig ist. Genau diese Zahl fehlt
  // ihm (Kundenrückmeldung 06.08.2026) — „1 Karton" ist der Normalfall und wäre
  // nur Rauschen. Fehlt die Angabe, wird NICHTS gezeigt: das Feld ist im ERP
  // (noch) kein Pflichtfeld, und ein stillschweigendes „1" wäre genau der
  // Fehlgriff, den die Anzeige verhindern soll.
  const cartons = beleg.inboundCartonCount ?? null;
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
        {cartons !== null && cartons > 1 ? (
          <>
            {' | '}
            {/* Kräftig gesetzt: die Zahl entscheidet, wie viel der MA vom Platz
                mitnimmt — sie darf nicht im grauen Fließtext untergehen. */}
            <Typography
              component="span"
              variant="body2"
              color="text.primary"
              sx={{ fontWeight: 700 }}
            >
              {cartons} Kartons
            </Typography>
          </>
        ) : null}
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
  // Beleg-Zusammenarbeit (31.08.2026): welcher Beleg gerade den „Beleg teilen"-
  // Dialog zeigt (Teilen-Symbol in der Ware-holen-Zeile).
  const [teilenCaseId, setTeilenCaseId] = useState<string | undefined>(undefined);

  const bundle = data?.bundle;
  // `cases` sind bereits pack-gefiltert (Backend): aktives Pack + mitgenommene
  // Problem-Belege früherer Packs. Vorgeplante Folge-Packs kommen gar nicht erst
  // hier an — die UI hat dazu nichts zu entscheiden.
  const cases = data?.cases ?? [];
  // „Geteilt mit dir" (Zusammenarbeit §3.5): Belege, an denen ich als HELFER
  // beteiligt bin — sie liegen im Karren des Inhabers, nie im eigenen Bündel.
  const sharedCases = data?.sharedCases ?? [];
  const pack = data?.pack ?? null;
  // Auch die Trennung aktiv/Mitnahme entscheidet das BACKEND (`carriedOver` je
  // Beleg, single source: pack-window). `pack.index` ist eine lücken-feste
  // ANZEIGE-Position und darf nie gegen persistierte packIndexe verglichen
  // werden — sonst bleibt „1 · Ware holen" nach abgeräumten Packs leer
  // (Bug 06.08.2026).
  const packCases = cases.filter((c) => c.carriedOver !== true);
  const carriedOverIds = new Set(cases.filter((c) => c.carriedOver === true).map((c) => c.id));

  // Ware-holen-Zustand (B2) kommt persistiert vom Backend (CaseSummaryDto
  // .collected, je Beleg-Container = Case-Id) — kein lokales Echo mehr, der
  // Haken überlebt Reload, Navigation und Gerätewechsel. Fertige Belege
  // zählen immer als geholt (bearbeitet wurde nur, was auf dem Karren lag),
  // damit die Zähler korrekt bleiben, obwohl ihre Container nicht mehr
  // gelistet werden.
  const closedIds = new Set(cases.filter((c) => isCaseClosed(c.status)).map((c) => c.id));
  // Beide Abschnitte lesen aus derselben Liste — der geteilte Beleg hat einen
  // Abhol-Container wie jeder andere. `collected` ist beim geteilten Beleg MEIN
  // Haken (Server: CaseParticipant.collectedAt), nicht der des Inhabers.
  const alleBelege = [...sharedCases, ...cases];
  const collectedIds = new Set(
    alleBelege.filter((c) => c.collected === true || isCaseClosed(c.status)).map((c) => c.id),
  );

  // ALLE Container (auch die fertiger Belege) bilden die Zähler-Basis;
  // gelistet werden nur die offenen (Kundenfeedback 04.08.2026: fertig = raus)
  // — in derselben Anzeige-Reihenfolge wie „2 · Bearbeiten" (05.08.2026).
  // Nur Belege des AKTIVEN Packs: mitgenommene Problem-Belege früherer Packs
  // liegen längst auf dem Tisch, da gibt es nichts mehr zu holen.
  // Ware holen umfasst seit dem 01.09.2026 AUCH die geteilten Belege: der
  // eingeladene Helfer holt die Ware bzw. seinen Teil davon selbst. Die
  // Route des fremden Bündels kennt er nicht — seine Container stehen deshalb
  // GANZ OBEN, in derselben Ordnung wie unter „2 · Bearbeiten".
  const geteilteStops = deriveStops([], sharedCases);
  const eigeneStops = deriveStops(bundle?.routeStops ?? [], packCases);
  const stops = [...geteilteStops, ...eigeneStops];
  const openStops = [
    ...stopsForDisplay(geteilteStops, sharedCases),
    ...stopsForDisplay(eigeneStops, packCases),
  ];
  const geteilteStopIds = new Set(geteilteStops.map((s) => s.id));

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
  // Bewusst nur die EIGENEN: ein geteilter Beleg gehört ins Bündel des Inhabers,
  // der Helfer kann ihn nicht in den Pool zurückgeben.
  const uncollectedCaseIds = eigeneStops
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
  // vollständig instruierte Belege ganz oben, offene Meldungen ganz unten).
  const visibleCases = casesForDisplay(cases);
  // Nachtrag 15.07.2026: der Beleg, dessen WE-Nr aktuell im Barcode-Pop-up steht.
  const barcodeCase = cases.find((c) => c.id === barcodeCaseId);
  // Der Beleg, dessen „Beleg teilen"-Dialog gerade offen ist (Zusammenarbeit).
  const teilenBeleg = cases.find((c) => c.id === teilenCaseId);
  // „Alles fertig" ignoriert geparkte Problemfälle: die warten auf den Teamlead,
  // der MA kann sie nicht weiter bearbeiten (Kundenfeedback 14.07.2026, Punkt 10).
  // Genau das ist auch die Bedingung, unter der das Backend das nächste Pack
  // freigibt — der Zustand hier und der Pull-Guard dort sagen dasselbe.
  const allDone =
    cases.length > 0 && cases.every((c) => isCaseClosed(c.status) || isCaseParked(c.status));
  // WIRKLICH alles fertig (completed/zst_done): beide Abschnitte wären leer —
  // stattdessen die kurze Fertig-Ansicht zeigen (Kundenfeedback 04.08.2026).
  // Solange Problemfälle/Geklärte übrig sind — auch mitgenommene aus früheren
  // Packs — bleiben die Abschnitte stehen, sonst verlöre der MA sie aus dem Blick.
  const allClosed = cases.length > 0 && cases.every((c) => isCaseClosed(c.status));
  // „2 · Bearbeiten" zeigt eigene UND geteilte Belege. Deshalb haengt der
  // Abschnitt nicht mehr am eigenen Bündel: wer nur mithilft, sieht ihn auch.
  const bearbeitenSichtbar = (Boolean(bundle) && !allClosed) || sharedCases.length > 0;
  // Wie „2 · Bearbeiten": wer nur mithilft, hat kein eigenes Bündel — soll die
  // Ware seines geteilten Belegs aber trotzdem holen.
  const wareHolenSichtbar = (Boolean(bundle) && !allClosed) || geteilteStops.length > 0;

  // Punkt 4: keine erzwungene Sequenz mehr — jeder GEHOLTE Beleg ist direkt
  // startbar. Nur das Holen selbst gated noch: ein Beleg, dessen Lagerplatz-Stop
  // nicht abgehakt ist, bleibt ausgegraut.
  const uncollectedCaseIdSet = new Set(
    stops.filter((s) => !collectedIds.has(s.id)).flatMap((s) => s.caseIds),
  );
  const isBelegStartable = (caseId: string): boolean => !uncollectedCaseIdSet.has(caseId);

  // „Pack 1 von 2" — nur wenn es überhaupt mehr als ein Pack gibt; bei einem
  // einzigen Pack wäre die Nummer nur Lärm.
  const packLabel = pack && pack.total > 1 ? `Pack ${pack.index + 1} von ${pack.total}` : null;

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
      <Typography sx={{ mb: packLabel ? 0.5 : 2 }}>
        Arbeitsplatz: {data?.workstation?.name ?? '—'}
      </Typography>
      {/* Pull-Prinzip: du arbeitest immer genau EIN Pack; das nächste holst du
          dir selbst. Kommende Packs sind hier bewusst nicht zu sehen. */}
      {packLabel ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {packLabel}
        </Typography>
      ) : null}

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
                {packLabel ? `${packLabel} erledigt` : 'Alle Belege erledigt'}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {packCases.length}/{packCases.length} erledigt — hol dir unten das nächste Pack.
              </Typography>
            </Paper>
          ) : null}
        </>
      )}

      {/* Sichtbar, solange es etwas zu holen gibt: eigenes offenes Pack ODER ein
          geteilter Beleg, dessen Ware ich als Helfer selbst mitholen soll. */}
      {wareHolenSichtbar ? (
        <>
          {/* 1 · Ware holen — inline pick list, check off right here (B1/B2).
                  Container fertiger Belege sind ausgeblendet (fertig = raus), die
                  Zähler laufen über ALLE Belege weiter. */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            1 · Ware holen
            {stops.length > 0 ? (
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {counts.collected}/{counts.total} Belege
              </Typography>
            ) : null}
          </Typography>
          <Stack spacing={1} sx={{ mb: 1 }}>
            {openStops.map((stop, index) => {
              const isDone = collectedIds.has(stop.id);
              const stopBelege = stop.caseIds
                .map((id) => alleBelege.find((c) => c.id === id))
                .filter((c): c is NonNullable<typeof c> => Boolean(c));
              // `deriveStops` baut EINEN Container je Beleg — am (einzigen)
              // Beleg des Stops hängt das Teilen-Symbol (Zusammenarbeit §3.1).
              const ersterBeleg = stopBelege[0];
              // Geteilter Beleg (Zusammenarbeit §4): golden markiert, damit sofort
              // klar ist, dass hier gemeinsam geholt wird. Als Helfer steht der
              // Inhaber im Chip, als Inhaber die Zahl der Helfer.
              const stopGeteilt =
                ersterBeleg !== undefined ? geteiltInfo(ersterBeleg, session?.employeeNo) : null;
              const stopGeteiltLabel =
                ersterBeleg === undefined
                  ? null
                  : (stopGeteilt?.label ??
                    (geteilteStopIds.has(stop.id) && ersterBeleg.assignedEmployeeName
                      ? `Geteilt mit ${ersterBeleg.assignedEmployeeName}`
                      : null));
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
                    ...(stopGeteiltLabel !== null
                      ? { borderLeft: `4px solid ${ltColors.shared}` }
                      : {}),
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
                    {stopGeteiltLabel !== null ? (
                      <Chip
                        size="small"
                        icon={<GroupsIcon />}
                        label={stopGeteiltLabel}
                        sx={{ ...GETEILT_CHIP_SX, mt: 0.5 }}
                      />
                    ) : null}
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
                  {/* Rechte Spalte (Kundenwunsch 01.09.2026): der Status-Chip ist
                          das EINZIGE Element im Fluss und bleibt dadurch exakt
                          vertikal mittig; der runde Teilen-Knopf schwebt direkt
                          darüber, ohne den Chip zu verschieben. Chip-Text „geholt"/„offen"
                          bleibt unverändert — die E2E-Helfer ankern darauf.
                          Fertige Belege stehen hier gar nicht mehr, und
                          `istTeilbar` schließt sie zusätzlich aus: ein
                          abgearbeiteter Beleg lässt sich nicht mehr teilen. */}
                  <Box sx={{ position: 'relative', flexShrink: 0 }}>
                    {ersterBeleg !== undefined && istTeilbar(ersterBeleg.status) ? (
                      <IconButton
                        aria-label="Beleg teilen"
                        size="small"
                        onClick={(event) => {
                          // Der Klick liegt in der abhakbaren Stop-Zeile —
                          // er darf den Stop nicht auf „geholt" togglen.
                          event.stopPropagation();
                          setTeilenCaseId(ersterBeleg.id);
                        }}
                        sx={{
                          // Schwebt ÜBER dem Chip, statt ihn aus der Mitte zu
                          // drängen: der Chip ist das einzige Element im Fluss.
                          position: 'absolute',
                          bottom: '100%',
                          left: '50%',
                          transform: 'translateX(-50%)',
                          mb: 0.5,
                          width: 32,
                          height: 32,
                          border: '1px solid',
                          borderColor: 'divider',
                          bgcolor: 'background.paper',
                          color: 'text.secondary',
                          '&:hover': { bgcolor: 'action.hover', color: 'text.primary' },
                        }}
                      >
                        <TeilenIcon sx={{ fontSize: 18 }} />
                      </IconButton>
                    ) : null}
                    <Chip
                      size="small"
                      color={isDone ? 'success' : 'default'}
                      label={isDone ? 'geholt' : 'offen'}
                    />
                  </Box>
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
        </>
      ) : null}

      {/* Sichtbar, solange es etwas zu bearbeiten gibt: eigenes offenes Pack ODER
          ein geteilter Beleg — auch ohne eigenes Bündel und nach dem eigenen Pack. */}
      {bearbeitenSichtbar ? (
        <>
          {/* 2 · Bearbeiten — the worker freely picks which fetched Beleg first
              (Punkt 4: no forced sequence; only not-yet-fetched Belege stay greyed).
              Fertige Belege sind ausgeblendet; der Zähler nimmt sie weiter mit.
              GANZ OBEN stehen die Belege, an denen ich als HELFER beteiligt bin
              (Zusammenarbeit §3.5, Kundenwunsch 01.09.2026): geteilte Arbeit ist das
              Dringlichste. Sie liegen im Karren des Inhabers — nichts zu holen, nie
              ausgegraut, ohne Holen-Gate; fertige Belege liefert der Server gar nicht
              erst mit. Der Abschnitt erscheint auch ohne eigenes Bündel. */}
          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, mt: 2 }}>
            2 · Bearbeiten
            {packCases.length > 0 ? (
              /* Zähler des AKTIVEN Packs — mitgenommene Belege früherer Packs
                 zählen dort weiter, nicht hier. */
              <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                {packCases.filter((c) => closedIds.has(c.id)).length}/{packCases.length} erledigt
              </Typography>
            ) : null}
          </Typography>
          {!collectComplete && cases.length > 0 ? (
            <Alert severity="info" sx={{ mb: 1 }}>
              Ausgegraute Belege erst holen — geholte Belege kannst du in beliebiger Reihenfolge
              starten.
            </Alert>
          ) : null}

          <Stack spacing={1}>
            {sharedCases.map((b) => {
              const chip = statusChipFor(b.status);
              const geteilt = geteiltInfo(b, session?.employeeNo);
              const KategorieIcon = ICON[goodsCategoryFor(b.storageLocationKind)];
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
                    // Seit dem 01.09.2026 holt auch der Helfer die Ware selbst —
                    // deshalb gilt hier dasselbe Holen-Gate wie bei eigenen Belegen.
                    cursor: isBelegStartable(b.id) ? 'pointer' : 'not-allowed',
                    opacity: isBelegStartable(b.id) ? 1 : 0.5,
                    borderLeft: `4px solid ${ltColors.shared}`,
                  }}
                >
                  {(b.issues?.length ?? 0) > 0 ? (
                    <IssueBadge issues={b.issues ?? []} />
                  ) : (
                    <KategorieIcon sx={{ fontSize: 26, color: 'text.secondary' }} />
                  )}
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                    <BelegInfoLine beleg={b} referenceDay={referenceDay} />
                    <Stack
                      direction="row"
                      spacing={1}
                      alignItems="center"
                      sx={{ mt: 0.5, flexWrap: 'wrap' }}
                    >
                      <Chip
                        size="small"
                        icon={<GroupsIcon />}
                        label={
                          geteilt?.label ??
                          (b.assignedEmployeeName
                            ? `Geteilt mit ${b.assignedEmployeeName}`
                            : 'Geteilt')
                        }
                        sx={GETEILT_CHIP_SX}
                      />
                      {geteilt ? (
                        <Typography variant="body2" color="text.secondary">
                          {geteilt.geprueft}/{geteilt.gesamt} geprüft
                        </Typography>
                      ) : null}
                    </Stack>
                  </Box>
                  <Chip size="small" color={chip.color} label={chip.label} />
                </Paper>
              );
            })}
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
              // Goldene Kennzeichnung des geteilten Belegs (Zusammenarbeit).
              const geteilt = geteiltInfo(b, session?.employeeNo);
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
                    // Goldene Linie des geteilten Belegs — nie Farbe allein:
                    // dazu kommen GroupsIcon + Text im Karteninhalt.
                    ...(geteilt ? { borderLeft: `4px solid ${ltColors.shared}` } : {}),
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
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ fontWeight: 700 }}>WE {b.weBelegNo}</Typography>
                      {/* Anzeige-Mitnahme: der Beleg stammt aus einem früheren
                              Pack und wird nur weiter angezeigt, damit du ihn nach
                              der Klärung abschließen kannst. Gezählt wird er dort. */}
                      {carriedOverIds.has(b.id) ? (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={`aus Pack ${b.packOrdinal ?? 1}`}
                        />
                      ) : null}
                    </Stack>
                    <BelegInfoLine beleg={b} referenceDay={referenceDay} />
                    {geteilt ? (
                      <Stack
                        direction="row"
                        spacing={1}
                        alignItems="center"
                        sx={{ mt: 0.5, flexWrap: 'wrap' }}
                      >
                        <Chip
                          size="small"
                          icon={<GroupsIcon />}
                          label={geteilt.label}
                          sx={GETEILT_CHIP_SX}
                        />
                        <Typography variant="body2" color="text.secondary">
                          {geteilt.geprueft}/{geteilt.gesamt} geprüft
                        </Typography>
                      </Stack>
                    ) : null}
                    {parked ? (
                      <Typography variant="body2" color="error.main" sx={{ fontWeight: 600 }}>
                        Wartet auf Klärung durch die Teamleitung – nicht bearbeitbar. Antippen zeigt
                        die Meldungen und TL-Hinweise.
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
                </Paper>
              );
            })}
          </Stack>

          {bundle && cases.length === 0 ? (
            <Alert severity="info">
              Aktuell keine Zuteilung. Sobald die Teamleitung zuteilt, erscheinen deine Belege hier.
            </Alert>
          ) : null}
        </>
      ) : null}

      {/* Pull-Prinzip: „Nächstes Pack anfordern". Ob das geht, entscheidet das
          Backend (`pack-window.ts`) — ist im laufenden Pack noch eigene Arbeit
          offen, antwortet es mit `pack_open`. Belege, die auf die Teamleitung
          warten, blockieren dabei nicht. Ist bereits ein Pack vorgeplant, wird es
          nur freigeschaltet; sonst zieht die Engine ein frisches aus dem Pool. */}
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
                ? 'Nächstes Pack holen'
                : 'Nächstes Pack anfordern'}
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

      {/* Beleg-Zusammenarbeit (31.08.2026): „Beleg teilen" — Kolleg:innen zum
          gemeinsamen Bearbeiten dieses Belegs einladen (Konzept §3.1). */}
      {teilenBeleg !== undefined ? (
        <TeilenDialog open beleg={teilenBeleg} onClose={() => setTeilenCaseId(undefined)} />
      ) : null}
    </Box>
  );
}

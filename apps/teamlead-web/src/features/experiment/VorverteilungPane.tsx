/**
 * Vorverteilung — die RÜCKSEITE des Beleg-Übersicht-Fensters im Experiment
 * DA.M.B (Flip-Karte, Leitstand-Konzept „Als Nächstes / Wagen vorbereiten").
 *
 * Die Packung kommt ausschließlich aus dem Engine-Dry-Run
 * (POST /assignments/preview → PreviewResult.bundles) — hier wird NICHTS
 * gepackt, nur angezeigt: für die nächsten N voraussichtlich freien
 * Mitarbeiter (kleinste Rest-Minuten im Board) je das erste geplante Bündel
 * als Container im Grid — Optik wie die Packs der Mitarbeiter-Matrix
 * (Beleg-Striche, matrixPacks.stripStyle) —, darunter EIN Container mit den
 * MA-Vorschlägen untereinander (1./2./3.) samt Fortschrittsbalken des
 * aktuellen Bündels je Name. Eingriffe
 * (Beleg raus/rein per Drag oder ✕, Pfeile, MA-Wechsel per Klick) verändern
 * nur den lokalen VORSCHLAG; verbindlich wird ein Bündel erst durch echtes
 * Zuweisen — Container auf eine Zeile der Mitarbeiter-Matrix ziehen (A1/A2).
 * Zahnrad: Anzahl vorzubereitender Bündel + „Vorverteilung sperren";
 * dazu der geteilte Automatik-Schalter des Tagescockpits.
 *
 * Starterbündel-Ansicht (rechteckiger Knopf unten, ersetzt den früheren
 * Vorschau-Hinweis): NUR Arbeiter, deren Schicht im eingestellten VORLAUF
 * beginnt und die noch keine Belege haben — ohne Haupt-Titel, Sperre,
 * Automatik-Schalter und Anzahl-Zahnrad. „Vorschlag ansehen" packt je
 * Kandidat das Starterbündel (Engine-Dry-Run) als ORANGEN Container; per
 * Starter-Einstellung wird einzeln per Klick übernommen (Container wird
 * normal) oder automatisch übernommen — die echte Zuweisung (assignBundle,
 * A1/A2) erfolgt exakt zum Schichtbeginn. Zweiter Toggler „Automatisch
 * erstellen": der Vorschlag wird ohne Klick generiert (läuft auch im
 * Hintergrund); jede Generierung meldet sich im Schnellaktionen-Popout
 * (starterStatus.ts).
 *
 * Der Vorlauf (Starter-Zahnrad, Voreinstellung 1 Stunde) ist EIN Fenster für
 * beides: Er entscheidet, wer hier als Starter auftaucht, und damit zugleich,
 * wann „Automatisch erstellen" losläuft — zwei getrennte Fenster gäbe es sonst
 * zu erklären. Entweder ein Wert für alle oder, per Schalter aufgeteilt, je
 * Schichttyp (Früh/Spät); der Schichttyp-Wert schlägt den gemeinsamen. Die
 * Einstellung liegt wie die übrigen im View-State (localStorage).
 */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useQuery } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import LinearProgress from '@mui/material/LinearProgress';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { alpha } from '@mui/material/styles';
import { ltColors } from '@paket/ui';
import { isManualOnlyTier } from '../../components/TierChip.js';
import { fetchEmployees, type EmployeeListItem } from '../../data/employees.js';
import {
  SHIFT_MODEL_COLORS,
  shiftKindOfStart,
  type ShiftKind,
  type ShiftModelName,
} from '../../lib/schichtFarben.js';
import { modelOfDay } from '../admin/SchichtplanTab.js';
import { useCockpitData } from '../../data/store.js';
import type { BoardCase, PreviewBundle } from '../../data/types.js';
import {
  EXPERIMENT_VORVERTEILUNG_VIEW_KEY,
  loadViewState,
  saveViewState,
} from '../../lib/viewState.js';
import { useAutomatik } from '../cockpit/automatik.js';
import type { ExperimentDragPayload } from './experimentDnd.js';
import { FERTIG_STATUSES, stripStyle } from './matrixPacks.js';
import { schreibeStarterStatus } from './starterStatus.js';

/** Zahnrad-Einstellungen der Vorverteilung (Saved View). */
interface VorverteilungSettings {
  /** Für so viele demnächst freie Mitarbeiter wird je ein Bündel vorbereitet. */
  count: number;
  /** Gesperrt: Vorschlag wird weder neu berechnet noch verändert. */
  locked: boolean;
  /** Starterbündel: automatisch übernehmen (sonst orange + Klick je Bündel). */
  starterAuto: boolean;
  /** Starterbündel: Vorschlag automatisch erstellen (ohne „Vorschlag ansehen"). */
  starterAutoErstellen: boolean;
  /**
   * Vorlauf in Stunden: so lange VOR Schichtbeginn gilt jemand als Starter —
   * das Fenster bestimmt zugleich, wann „Automatisch erstellen" den Vorschlag
   * baut. Gilt für alle Schichttypen, solange `starterVorlaufJeSchicht` leer ist.
   */
  starterVorlaufStunden: number;
  /**
   * Abweichender Vorlauf je Schichttyp. Leer = der globale Wert gilt überall;
   * gefüllt = die Werte hier schlagen ihn (Früh darf anders vorlaufen als Spät).
   */
  starterVorlaufJeSchicht: Partial<Record<ShiftKind, number>>;
}

/** Wählbare Vorlaufzeiten in Stunden. */
const STARTER_VORLAUF_OPTIONEN = [1, 2, 3, 4, 6, 8, 12] as const;

/** Die arbeitenden Schichttypen — „Frei" hat keinen Schichtstart. */
const STARTER_SCHICHTTYPEN: readonly { kind: ShiftKind; label: ShiftModelName }[] = [
  { kind: 'frueh', label: 'Frühschicht' },
  { kind: 'spaet', label: 'Spätschicht' },
];

const stundenLabel = (h: number): string => (h === 1 ? '1 Stunde' : `${h} Stunden`);

/** Jeden Schichttyp auf denselben Vorlauf setzen (Startwert der Aufteilung). */
function vorlaufJeSchichtAus(stunden: number): Partial<Record<ShiftKind, number>> {
  const out: Partial<Record<ShiftKind, number>> = {};
  for (const t of STARTER_SCHICHTTYPEN) out[t.kind] = stunden;
  return out;
}

/** Vorlauf für EINEN Schichtstart: der Schichttyp-Wert schlägt den globalen. */
function vorlaufStundenFuer(s: VorverteilungSettings, startIso: string): number {
  return s.starterVorlaufJeSchicht[shiftKindOfStart(startIso)] ?? s.starterVorlaufStunden;
}

/**
 * Fenster-Text für Überschrift und Leerzustand: „in der nächsten Stunde",
 * „in den nächsten 3 Stunden" — oder, wenn die Schichttypen verschieden
 * eingestellt sind, der neutrale Verweis auf den jeweiligen Vorlauf.
 */
function starterVorlaufText(s: VorverteilungSettings): string {
  const werte = [
    ...new Set(
      STARTER_SCHICHTTYPEN.map((t) => s.starterVorlaufJeSchicht[t.kind] ?? s.starterVorlaufStunden),
    ),
  ];
  if (werte.length > 1) return 'im Vorlauf der jeweiligen Schicht';
  return werte[0] === 1 ? 'in der nächsten Stunde' : `in den nächsten ${werte[0]} Stunden`;
}

function sanitizeSettings(raw: Partial<VorverteilungSettings> | null): VorverteilungSettings {
  const count =
    typeof raw?.count === 'number' && Number.isFinite(raw.count)
      ? Math.min(6, Math.max(1, Math.round(raw.count)))
      : 3;
  const stunden = (wert: unknown, fallback: number): number =>
    typeof wert === 'number' && Number.isFinite(wert)
      ? Math.min(24, Math.max(1, Math.round(wert)))
      : fallback;
  const starterVorlaufStunden = stunden(raw?.starterVorlaufStunden, 1);
  // Nur gesetzte Schichttypen übernehmen — fehlt einer, gilt für ihn der globale Wert.
  const starterVorlaufJeSchicht: Partial<Record<ShiftKind, number>> = {};
  for (const t of STARTER_SCHICHTTYPEN) {
    const wert = raw?.starterVorlaufJeSchicht?.[t.kind];
    if (wert !== undefined) starterVorlaufJeSchicht[t.kind] = stunden(wert, starterVorlaufStunden);
  }
  return {
    count,
    locked: raw?.locked === true,
    starterAuto: raw?.starterAuto === true,
    starterAutoErstellen: raw?.starterAutoErstellen === true,
    starterVorlaufStunden,
    starterVorlaufJeSchicht,
  };
}

/** ISO → „HH:MM" (lokal) für Schichtbeginn-Texte. */
function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

const TAG_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** Nächster geplanter Schichtstart eines Mitarbeiters ab `ab` (7-Tage-Blick aufs Wochenmuster). */
function naechsterSchichtstart(
  emp: EmployeeListItem,
  ab: number,
): { start: Date; model: ShiftModelName } | null {
  for (let offset = 0; offset < 8; offset += 1) {
    const tag = new Date(ab);
    tag.setHours(0, 0, 0, 0);
    tag.setDate(tag.getDate() + offset);
    const plan = emp.weeklyPattern?.[TAG_KEYS[(tag.getDay() + 6) % 7] ?? 'mon'];
    if (!plan || !plan.working || !plan.start) continue;
    const model = modelOfDay(plan) as ShiftModelName;
    if (model === 'Frei') continue;
    const [h, m] = plan.start.split(':').map(Number);
    const start = new Date(tag);
    start.setHours(h ?? 0, m ?? 0, 0, 0);
    if (start.getTime() > ab) return { start, model };
  }
  return null;
}

/** Ein lokal zurechtgerückter Vorschlags-Slot (Basis: erstes Engine-Bündel des MA). */
interface Slot {
  employeeId: string;
  caseIds: string[];
}

interface CaseInfo {
  weBelegNo: string;
  teile: number;
  minutes: number;
  status: BoardCase['status'];
}

export interface VorverteilungPaneProps {
  /** Rückseite ist sichtbar — löst beim ersten Aufdecken den Engine-Lauf aus. */
  active: boolean;
  dragging: ExperimentDragPayload | null;
  onDragStart: (payload: ExperimentDragPayload) => void;
  onDragEnd: () => void;
}

export function VorverteilungPane({
  active,
  dragging,
  onDragStart,
  onDragEnd,
}: VorverteilungPaneProps): JSX.Element {
  const { board, lanes, preview, assignBundle } = useCockpitData();
  const [automatik, setAutomatik] = useAutomatik();
  const [settings, setSettings] = useState<VorverteilungSettings>(() =>
    sanitizeSettings(
      loadViewState<Partial<VorverteilungSettings> | null>(EXPERIMENT_VORVERTEILUNG_VIEW_KEY, null),
    ),
  );
  const [gearAnchor, setGearAnchor] = useState<HTMLElement | null>(null);
  const [maMenu, setMaMenu] = useState<{ slot: number; anchor: HTMLElement } | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [overRemove, setOverRemove] = useState(false);
  // Starterbündel-Ansicht (Knopf unten): Schichtstarter der nächsten Stunde.
  const [ansicht, setAnsicht] = useState<'naechste' | 'starter'>('naechste');
  const [starterVorschlagAktiv, setStarterVorschlagAktiv] = useState(false);
  const [starterStand, setStarterStand] = useState<
    Record<string, 'verifiziert' | 'zugewiesen'>
  >({});
  const [starterGearAnchor, setStarterGearAnchor] = useState<HTMLElement | null>(null);
  const [jetzt, setJetzt] = useState(() => Date.now());
  // Leerer Starter-Zustand: „Kommende Starter anschauen" (Früh/Spät-Gruppen).
  const [kommendeOffen, setKommendeOffen] = useState(false);

  const saveSettings = (next: VorverteilungSettings): void => {
    setSettings(next);
    saveViewState(EXPERIMENT_VORVERTEILUNG_VIEW_KEY, next);
  };

  // Wer ist demnächst frei? Rest-Arbeit = Σ Minuten der nicht fertigen Belege
  // (reine Anzeige-Reihung; Abwesende + Manuell-only-Kräfte (starter/dummy)
  // raus — für die packt die Engine nie —, Pausierte ans Ende).
  const workers = useMemo(
    () =>
      board
        .filter((r) => (r.absence ?? null) === null && !isManualOnlyTier(r.skillTier))
        .map((r) => {
          const gesamtMinutes = r.cases.reduce((sum, c) => sum + c.estimatedMinutes, 0);
          const restMinutes = Math.round(
            r.cases
              .filter((c) => !FERTIG_STATUSES.includes(c.status))
              .reduce((sum, c) => sum + c.estimatedMinutes, 0),
          );
          return {
            employeeId: r.employeeId,
            name: r.displayName,
            paused: r.paused,
            restMinutes,
            // Bündel-Fortschritt in % (fertige Minuten / Gesamt); ohne Bündel 100.
            fortschrittPct:
              gesamtMinutes > 0
                ? Math.max(
                    0,
                    Math.min(100, Math.round(((gesamtMinutes - restMinutes) / gesamtMinutes) * 100)),
                  )
                : 100,
          };
        })
        .sort(
          (a, b) =>
            Number(a.paused) - Number(b.paused) ||
            a.restMinutes - b.restMinutes ||
            a.name.localeCompare(b.name, 'de'),
        ),
    [board],
  );
  const workerById = useMemo(() => new Map(workers.map((w) => [w.employeeId, w])), [workers]);

  // Anzeige-Kontext je Beleg: Ablage-Karten (ready-Pool) + Board-Belege (re-geplant).
  const caseById = useMemo(() => {
    const map = new Map<string, CaseInfo>();
    for (const lane of lanes)
      for (const card of lane.cards)
        map.set(card.caseId, {
          weBelegNo: card.weBelegNo,
          teile: card.totalQuantity,
          minutes: card.estimatedMinutes,
          status: card.status,
        });
    for (const row of board)
      for (const c of row.cases)
        if (!map.has(c.caseId))
          map.set(c.caseId, {
            weBelegNo: c.weBelegNo,
            teile: c.totalQuantity,
            minutes: c.estimatedMinutes,
            status: c.status,
          });
    // Fallback: die Engine liefert Anzeige-Metadaten mit — deckt Belege ab, die
    // weder in den Lanes noch im Board-Snapshot auftauchen (Status dort = ready,
    // weil der Dry-Run assigned→ready normalisiert; der Server validiert echt).
    for (const b of preview.data?.bundles ?? [])
      for (const c of b.cases)
        if (!map.has(c.caseId))
          map.set(c.caseId, {
            weBelegNo: c.weBelegNo,
            teile: c.teile,
            minutes: c.minutes,
            status: 'ready',
          });
    return map;
  }, [lanes, board, preview.data]);

  // Engine-Bündel nennen die DB-Id des MA, Board-Zeilen die employeeNo — die
  // (gecachte) Mitarbeiterliste schlägt die Brücke (gleicher Key wie
  // useEmployeeNames, daher kein zusätzlicher Request).
  const { data: employeeList } = useQuery({
    queryKey: ['admin', 'employees', 'names'],
    queryFn: () => fetchEmployees(),
    staleTime: 5 * 60 * 1000,
  });
  const employeeNoById = useMemo(
    () => new Map((employeeList?.employees ?? []).map((e) => [e.id, e.employeeNo])),
    [employeeList],
  );

  // Beim ersten Aufdecken einmal automatisch rechnen lassen (nicht bei Sperre).
  const previewData = preview.data;
  const runPreview = preview.mutate;
  useEffect(() => {
    if (active && !settings.locked && previewData === undefined && !preview.isPending && !preview.isError)
      runPreview();
  }, [active, settings.locked, previewData, preview.isPending, preview.isError, runPreview]);

  // Slots aus Engine-Lauf + Kandidaten ableiten. Bewusst NICHT bei jedem
  // Board-Refresh (Refs), damit lokale Eingriffe stehen bleiben; die Sperre
  // friert zusätzlich ein.
  const workersRef = useRef(workers);
  workersRef.current = workers;
  const lockedRef = useRef(settings.locked);
  lockedRef.current = settings.locked;
  const employeeNoByIdRef = useRef(employeeNoById);
  employeeNoByIdRef.current = employeeNoById;
  // Einmalig neu ableiten, sobald die Id-Brücke da ist (danach stabil true —
  // spätere Employees-Refetches werfen lokale Eingriffe also NICHT weg).
  const bridgeReady = employeeList !== undefined;
  useEffect(() => {
    if (lockedRef.current || previewData === undefined) return;
    const byEmployee = new Map<string, PreviewBundle[]>();
    for (const b of previewData.bundles) {
      // Schlüssel = employeeNo (Board-Welt); Fallback auf die rohe Id.
      const no = employeeNoByIdRef.current.get(b.employeeId) ?? b.employeeId;
      const list = byEmployee.get(no) ?? [];
      list.push(b);
      byEmployee.set(no, list);
    }
    setSlots(
      workersRef.current.slice(0, settings.count).map((w) => ({
        employeeId: w.employeeId,
        caseIds: [...(byEmployee.get(w.employeeId)?.[0]?.caseIds ?? [])],
      })),
    );
  }, [previewData, settings.count, bridgeReady]);

  const weNoOf = (caseId: string): string => caseById.get(caseId)?.weBelegNo ?? caseId;
  const slotStats = (slot: Slot): { teile: number; minutes: number } =>
    slot.caseIds.reduce(
      (acc, id) => {
        const c = caseById.get(id);
        if (c !== undefined) {
          acc.teile += c.teile;
          acc.minutes += c.minutes;
        }
        return acc;
      },
      { teile: 0, minutes: 0 },
    );

  const moveCaseInSlot = (slotIdx: number, caseIdx: number, delta: -1 | 1): void =>
    setSlots((prev) =>
      prev?.map((s, i) => {
        if (i !== slotIdx) return s;
        const next = [...s.caseIds];
        const target = caseIdx + delta;
        if (target < 0 || target >= next.length) return s;
        const [moved] = next.splice(caseIdx, 1);
        if (moved === undefined) return s;
        next.splice(target, 0, moved);
        return { ...s, caseIds: next };
      }) ?? prev,
    );

  const removeCase = (slotIdx: number, caseId: string): void =>
    setSlots((prev) =>
      prev?.map((s, i) => (i === slotIdx ? { ...s, caseIds: s.caseIds.filter((id) => id !== caseId) } : s)) ??
      prev,
    );

  /** Beleg in Slot aufnehmen; aus allen anderen Slots entfernen (Verschieben). */
  const addCase = (slotIdx: number, caseId: string): void =>
    setSlots((prev) =>
      prev?.map((s, i) =>
        i === slotIdx
          ? s.caseIds.includes(caseId)
            ? s
            : { ...s, caseIds: [...s.caseIds, caseId] }
          : { ...s, caseIds: s.caseIds.filter((id) => id !== caseId) },
      ) ?? prev,
    );

  const slotDropOk = (slotIdx: number): boolean => {
    if (settings.locked || dragging === null || slots === null) return false;
    if (dragging.source === 'ablage')
      return (
        dragging.status === 'ready' &&
        dragging.forwardedTo === null &&
        !slots.some((s) => s.caseIds.includes(dragging.caseId))
      );
    if (dragging.source === 'vorschlag') return dragging.slot !== slotIdx;
    return false;
  };

  const bundlePayload = (slotIdx: number, slot: Slot): ExperimentDragPayload => ({
    source: 'vorschlag-bundle',
    slot: slotIdx,
    caseIds: [...slot.caseIds],
    teile: slotStats(slot).teile,
    allReady:
      slot.caseIds.length > 0 && slot.caseIds.every((id) => caseById.get(id)?.status === 'ready'),
  });

  const locked = settings.locked;

  const verlasseStarter = (): void => {
    setAnsicht('naechste');
    setStarterVorschlagAktiv(false);
    setStarterStand({});
    setKommendeOffen(false);
  };

  // „Kommende Starter": nächster geplanter Schichtstart je Mitarbeiter (aus
  // dem Wochenmuster), gruppiert nach Schichtgruppe (Frühschicht/Spätschicht).
  const kommendeGruppen = useMemo(() => {
    if (!kommendeOffen) return [];
    const starter = (employeeList?.employees ?? [])
      .filter((e) => e.active && e.roles.includes('employee'))
      .flatMap((e) => {
        const next = naechsterSchichtstart(e, jetzt);
        return next === null ? [] : [{ id: e.id, name: e.displayName, ...next }];
      })
      .sort((a, b) => a.start.getTime() - b.start.getTime());
    return (['Frühschicht', 'Spätschicht'] as ShiftModelName[])
      .map((model) => ({ model, starter: starter.filter((s) => s.model === model) }))
      .filter((g) => g.starter.length > 0);
  }, [kommendeOffen, employeeList, jetzt]);

  // Uhr der Starter-Ansicht: alle 30 s, damit Countdown und Schichtbeginn ziehen.
  useEffect(() => {
    if (ansicht !== 'starter' && !settings.starterAutoErstellen) return;
    setJetzt(Date.now());
    const t = window.setInterval(() => setJetzt(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, [ansicht, settings.starterAutoErstellen]);

  // Wer braucht als Nächstes ein Starterbündel? Schichtstart im eingestellten
  // Vorlauf (10-Min-Nachlauf für die Übernahme), noch OHNE Belege — nicht die,
  // die bereits arbeiten; Manuell-only-Kräfte packt die Engine nie. Der Vorlauf
  // kommt je Schichttyp aus den Starter-Einstellungen (Zahnrad).
  const starterKandidaten = useMemo(
    () =>
      board.filter((r) => {
        if ((r.absence ?? null) !== null || isManualOnlyTier(r.skillTier)) return false;
        if (r.shiftStart == null || r.cases.length > 0) return false;
        const start = Date.parse(r.shiftStart);
        const fenster = vorlaufStundenFuer(settings, r.shiftStart) * 60 * 60_000;
        return start > jetzt - 10 * 60_000 && start - jetzt <= fenster;
      }),
    [board, jetzt, settings],
  );

  // Fenster-Text für Überschrift und Leerzustand — folgt derselben Einstellung.
  const vorlaufFensterText = starterVorlaufText(settings);
  // Die Aufteilung je Schichttyp ist aktiv, sobald mindestens ein Typ einen
  // eigenen Wert trägt — dafür braucht es kein zusätzliches Schalter-Feld.
  const vorlaufJeSchichtAktiv = STARTER_SCHICHTTYPEN.some(
    (t) => settings.starterVorlaufJeSchicht[t.kind] !== undefined,
  );

  // „Automatisch erstellen": sobald jemand im eingestellten Vorlauf startet,
  // wird der Vorschlag ohne Klick generiert (läuft auch außerhalb der Ansicht).
  useEffect(() => {
    if (!settings.starterAutoErstellen || starterVorschlagAktiv) return;
    if (starterKandidaten.length === 0) return;
    setStarterVorschlagAktiv(true);
    if (!preview.isPending) runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.starterAutoErstellen, starterKandidaten.length, starterVorschlagAktiv]);

  // Vorschlags-Bündel je Kandidat (erstes Engine-Bündel, gleiche Id-Brücke).
  const starterSlots = useMemo(() => {
    if (!starterVorschlagAktiv || previewData === undefined) return null;
    const byEmployee = new Map<string, PreviewBundle>();
    for (const b of previewData.bundles) {
      const no = employeeNoById.get(b.employeeId) ?? b.employeeId;
      if (!byEmployee.has(no)) byEmployee.set(no, b);
    }
    return starterKandidaten.map((row) => ({
      row,
      bundle: byEmployee.get(row.employeeId) ?? null,
    }));
  }, [starterVorschlagAktiv, previewData, employeeNoById, starterKandidaten]);

  // Generierte Starterbündel im Schnellaktionen-Popout melden (starterStatus).
  useEffect(() => {
    if (starterSlots === null) return;
    const anzahl = starterSlots.filter((s) => s.bundle !== null).length;
    if (anzahl === 0) return;
    schreibeStarterStatus({
      generiertAm: new Date().toISOString(),
      anzahl,
      auto: settings.starterAutoErstellen,
    });
  }, [starterSlots, settings.starterAutoErstellen]);

  // Übernommene Bündel EXAKT zum Schichtbeginn wirklich zuweisen (A1/A2) —
  // einmal je Mitarbeiter; der Board-Refetch nimmt ihn danach aus der Liste.
  useEffect(() => {
    if ((ansicht !== 'starter' && !settings.starterAutoErstellen) || starterSlots === null) return;
    for (const { row, bundle } of starterSlots) {
      if (bundle === null || row.shiftStart == null || bundle.caseIds.length === 0) continue;
      const start = Date.parse(row.shiftStart);
      const stand = starterStand[row.employeeId];
      const bereit = settings.starterAuto || stand === 'verifiziert';
      if (start <= jetzt && bereit && stand !== 'zugewiesen') {
        setStarterStand((p) => ({ ...p, [row.employeeId]: 'zugewiesen' }));
        assignBundle.mutate({
          employeeNo: row.employeeId,
          caseIds: [...bundle.caseIds],
          reason: 'Starterbündel automatisch zu Schichtbeginn übernommen',
        });
      }
    }
    // assignBundle (Mutation-Objekt) bewusst keine Dep — Guard über starterStand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ansicht, starterSlots, starterStand, settings.starterAuto, jetzt]);

  return (
    <Stack sx={{ height: '100%', minHeight: 0, p: 1, gap: 0.75 }}>
      {ansicht === 'naechste' ? (
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>
          Als Nächstes — {slots?.length ?? 0} Bündel vorbereitet
        </Typography>
        {locked && (
          <Chip
            size="small"
            icon={<LockOutlinedIcon sx={{ fontSize: 13 }} />}
            label="gesperrt"
            sx={{ height: 20, fontSize: '0.62rem' }}
          />
        )}
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
          {previewData !== undefined
            ? `${previewData.assignedCaseCount} Belege verplant · ${previewData.unassignedCaseCount} im Topf`
            : 'Noch kein Vorschlag berechnet.'}
        </Typography>
        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={automatik}
                onChange={(e) => setAutomatik(e.target.checked)}
              />
            }
            label="Automatik"
            sx={{ mr: 0, '& .MuiFormControlLabel-label': { fontSize: '0.72rem', fontWeight: 600 } }}
          />
          <Button
            size="small"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={() => runPreview()}
            disabled={locked || preview.isPending}
            sx={{ fontSize: '0.7rem' }}
          >
            Vorschlag ansehen
          </Button>
          <Tooltip title="Vorverteilung einstellen (Anzahl · Sperre)">
            <IconButton
              size="small"
              aria-label="Vorverteilung einstellen"
              onClick={(e) => setGearAnchor(e.currentTarget)}
              sx={{ p: 0.25 }}
            >
              <SettingsIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      ) : (
        // Starter-Ansicht: bewusst OHNE Haupt-Titel, Sperre, Automatik, Anzahl.
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
          <IconButton
            size="small"
            aria-label="Starterbündel verlassen"
            onClick={verlasseStarter}
            sx={{ p: 0.25 }}
          >
            <ArrowBackIcon sx={{ fontSize: 18 }} />
          </IconButton>
          <Typography sx={{ fontWeight: 800, fontSize: '0.85rem' }}>
            Starterbündel — Schichtstart {vorlaufFensterText}
          </Typography>
          <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Button
              size="small"
              startIcon={<VisibilityOutlinedIcon />}
              onClick={() => {
                setStarterVorschlagAktiv(true);
                runPreview();
              }}
              disabled={preview.isPending}
              sx={{ fontSize: '0.7rem' }}
            >
              Vorschlag ansehen
            </Button>
            <Tooltip title="Starterbündel einstellen (Übernahme und Vorlauf)">
              <IconButton
                size="small"
                aria-label="Starterbündel einstellen"
                onClick={(e) => setStarterGearAnchor(e.currentTarget)}
                sx={{ p: 0.25 }}
              >
                <SettingsIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>
      )}

      {preview.isPending && <LinearProgress sx={{ flexShrink: 0 }} />}
      {preview.isError && (
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={() => runPreview()}>
              Erneut
            </Button>
          }
        >
          Vorschlag fehlgeschlagen: {preview.error?.message ?? 'Unbekannter Fehler.'}
        </Alert>
      )}

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {ansicht === 'starter' ? (
          starterKandidaten.length === 0 ? (
            <Stack spacing={0.75}>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
              >
                <Typography
                  sx={{ color: 'text.secondary', fontSize: '0.78rem', flex: 1, minWidth: 220 }}
                >
                  Kein Schichtstart {vorlaufFensterText} — gerade braucht niemand ein
                  Starterbündel.
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => setKommendeOffen((v) => !v)}
                  sx={{ flexShrink: 0, fontSize: '0.7rem' }}
                >
                  {kommendeOffen ? 'Kommende Starter ausblenden' : 'Kommende Starter anschauen'}
                </Button>
              </Paper>
              {kommendeOffen && kommendeGruppen.length === 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                  Keine geplanten Schichtstarts in den nächsten 7 Tagen.
                </Typography>
              )}
              {kommendeOffen &&
                kommendeGruppen.map((g) => (
                  // Eigener Container je Schichtgruppe (Nutzer-Vorgabe).
                  <Paper key={g.model} variant="outlined" sx={{ p: 0.75 }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                      <Box
                        aria-hidden
                        sx={{
                          width: 10,
                          height: 10,
                          borderRadius: 0.5,
                          bgcolor: SHIFT_MODEL_COLORS[g.model],
                        }}
                      />
                      <Typography sx={{ fontSize: '0.68rem', fontWeight: 800 }}>
                        {g.model} ({g.starter.length})
                      </Typography>
                    </Box>
                    {/* Grid mit maximal 4 Startern pro Reihe (Nutzer-Vorgabe). */}
                    <Box
                      sx={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
                        gap: 0.5,
                      }}
                    >
                      {g.starter.map((s) => (
                        <Paper key={s.id} variant="outlined" sx={{ px: 0.75, py: 0.5 }}>
                          <Typography sx={{ fontSize: '0.7rem', fontWeight: 700 }} noWrap>
                            {s.name}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.62rem' }}
                          >
                            ab {s.start.toLocaleDateString('de-DE', { weekday: 'short' })}{' '}
                            {hhmm(s.start.toISOString())}
                          </Typography>
                        </Paper>
                      ))}
                    </Box>
                  </Paper>
                ))}
            </Stack>
          ) : (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${starterKandidaten.length}, minmax(190px, 1fr))`,
                gap: 0.75,
                alignItems: 'start',
              }}
            >
              {(starterSlots ?? starterKandidaten.map((row) => ({ row, bundle: null }))).map(
                ({ row, bundle }) => {
                  const startText = row.shiftStart != null ? hhmm(row.shiftStart) : '—';
                  const inMin =
                    row.shiftStart != null
                      ? Math.round((Date.parse(row.shiftStart) - jetzt) / 60_000)
                      : null;
                  const stand = starterStand[row.employeeId];
                  const bereit =
                    settings.starterAuto || stand === 'verifiziert' || stand === 'zugewiesen';
                  // Orange = unbestätigter Vorschlag (Einstellung: einzeln verifizieren).
                  const orange = starterVorschlagAktiv && bundle !== null && !bereit;
                  return (
                    <Paper
                      key={row.employeeId}
                      variant="outlined"
                      data-testid={`starter-slot-${row.employeeId}`}
                      role={orange ? 'button' : undefined}
                      aria-label={
                        orange ? `Starterbündel für ${row.displayName} übernehmen` : undefined
                      }
                      onClick={
                        orange
                          ? () =>
                              setStarterStand((p) => ({
                                ...p,
                                [row.employeeId]: 'verifiziert',
                              }))
                          : undefined
                      }
                      sx={{
                        minWidth: 0,
                        borderRadius: 1,
                        p: 0.5,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 0.375,
                        ...(orange
                          ? {
                              cursor: 'pointer',
                              borderColor: ltColors.warning,
                              boxShadow: `inset 0 0 0 1px ${ltColors.warning}`,
                              bgcolor: alpha(ltColors.warning, 0.14),
                            }
                          : {}),
                      }}
                    >
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <Typography
                          sx={{
                            fontSize: '0.6rem',
                            fontWeight: 700,
                            color: 'text.secondary',
                            flexShrink: 0,
                          }}
                        >
                          Starterbündel
                        </Typography>
                        {bundle !== null && (
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.6rem', fontWeight: 700 }}
                            noWrap
                          >
                            · {bundle.cases.length}{' '}
                            {bundle.cases.length === 1 ? 'Beleg' : 'Belege'} ·{' '}
                            {bundle.cases.reduce((s, c) => s + c.teile, 0)} Teile
                          </Typography>
                        )}
                        <Chip
                          size="small"
                          label={row.displayName}
                          sx={{ ml: 'auto', height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                        />
                      </Box>
                      <Typography sx={{ fontSize: '0.62rem', color: 'text.secondary' }}>
                        Schicht ab {startText}
                        {inMin !== null && (inMin > 0 ? ` · in ≈ ${inMin} Min` : ' · JETZT')}
                      </Typography>
                      {!starterVorschlagAktiv && (
                        <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>
                          „Vorschlag ansehen" lässt die Engine das Starterbündel packen.
                        </Typography>
                      )}
                      {starterVorschlagAktiv && bundle === null && (
                        <Typography sx={{ fontSize: '0.58rem', color: 'text.secondary' }}>
                          Kein Engine-Vorschlag für diesen Mitarbeiter.
                        </Typography>
                      )}
                      {starterVorschlagAktiv && bundle !== null && (
                        <>
                          <Typography
                            sx={{
                              fontSize: '0.56rem',
                              fontWeight: 700,
                              letterSpacing: 0.3,
                              textTransform: 'uppercase',
                              color: 'text.secondary',
                              px: 0.25,
                            }}
                          >
                            Geplant ({bundle.cases.length})
                          </Typography>
                          {bundle.cases.map((c, idx) => (
                            <Box
                              key={c.caseId}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 0.25,
                                px: 0.5,
                                py: 0.25,
                                borderRadius: 0.5,
                                borderLeft: '3px solid',
                                borderLeftColor: 'divider',
                                bgcolor: 'action.hover',
                              }}
                            >
                              <Typography
                                sx={{
                                  fontSize: '0.66rem',
                                  fontWeight: 600,
                                  flex: 1,
                                  minWidth: 0,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {idx + 1}. {c.weBelegNo}
                              </Typography>
                              <Typography
                                variant="caption"
                                sx={{
                                  color: 'text.secondary',
                                  fontSize: '0.6rem',
                                  flexShrink: 0,
                                }}
                              >
                                {c.teile} Teile
                              </Typography>
                            </Box>
                          ))}
                          <Typography
                            sx={{
                              fontSize: '0.58rem',
                              fontWeight: 700,
                              color:
                                stand === 'zugewiesen'
                                  ? 'success.main'
                                  : orange
                                    ? ltColors.warning
                                    : 'text.secondary',
                            }}
                          >
                            {stand === 'zugewiesen'
                              ? 'Zugewiesen ✓'
                              : orange
                                ? 'Klicken zum Übernehmen — sonst keine automatische Zuweisung.'
                                : `Übernommen — Zuweisung automatisch zu Schichtbeginn (${startText}).`}
                          </Typography>
                        </>
                      )}
                    </Paper>
                  );
                },
              )}
            </Box>
          )
        ) : (
          <>
        {slots === null || slots.length === 0 ? (
          <Paper
            variant="outlined"
            sx={{ p: 2, textAlign: 'center', color: 'text.secondary', fontSize: '0.78rem' }}
          >
            {workers.length === 0
              ? 'Keine anwesenden Mitarbeiter im Board — es kann nichts vorbereitet werden.'
              : 'Noch keine Vorverteilung — „Vorschlag ansehen" lässt die Engine die nächsten Bündel packen.'}
          </Paper>
        ) : (
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: `repeat(${slots.length}, minmax(170px, 1fr))`,
              gap: 0.75,
              alignItems: 'start',
            }}
          >
            {slots.map((slot, i) => {
              const stats = slotStats(slot);
              const worker = workerById.get(slot.employeeId);
              return (
                <Paper
                  key={`bundle-${i}`}
                  variant="outlined"
                  data-testid={`vorschlag-slot-${i}`}
                  onDragOver={(e) => {
                    if (!slotDropOk(i)) return;
                    e.preventDefault();
                    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
                    setOverSlot(i);
                  }}
                  onDragLeave={() => setOverSlot((o) => (o === i ? null : o))}
                  onDrop={() => {
                    if (!slotDropOk(i) || dragging === null) return;
                    setOverSlot(null);
                    if (dragging.source === 'ablage' || dragging.source === 'vorschlag')
                      addCase(i, dragging.caseId);
                    onDragEnd();
                  }}
                  sx={{
                    // Pack-Container-Optik der Mitarbeiter-Matrix.
                    minWidth: 0,
                    borderRadius: 1,
                    bgcolor: overSlot === i ? 'action.hover' : 'background.paper',
                    p: 0.5,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 0.375,
                  }}
                >
                  {/* Kopf = Drag-Griff des GANZEN Bündels (Drop auf Matrix-Zeile = A1/A2). */}
                  <Box
                    draggable={!locked && slot.caseIds.length > 0}
                    onDragStart={(e) => {
                      if (e.dataTransfer) {
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', `Bündel ${i + 1}`);
                      }
                      onDragStart(bundlePayload(i, slot));
                    }}
                    onDragEnd={onDragEnd}
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.5,
                      px: 0.25,
                      py: 0,
                      cursor: !locked && slot.caseIds.length > 0 ? 'grab' : 'default',
                    }}
                  >
                    {/* Kopfzeile im Wortlaut/Look des Matrix-Packs. */}
                    <Typography
                      sx={{ fontSize: '0.6rem', fontWeight: 700, color: 'text.secondary', flexShrink: 0 }}
                    >
                      {i + 1}. Bündel
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{ color: 'text.secondary', fontSize: '0.6rem', fontWeight: 700 }}
                      noWrap
                    >
                      · {slot.caseIds.length} {slot.caseIds.length === 1 ? 'Beleg' : 'Belege'} ·{' '}
                      {stats.teile} Teile · ≈ {Math.round(stats.minutes)} Min
                    </Typography>
                    <Tooltip title="MA-Vorschlag wechseln — für wen dieses Bündel vorbereitet wird">
                      <Chip
                        size="small"
                        data-testid={`vorschlag-ma-${i}`}
                        label={worker?.name ?? slot.employeeId}
                        onClick={locked ? undefined : (e) => setMaMenu({ slot: i, anchor: e.currentTarget })}
                        sx={{ ml: 'auto', height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                      />
                    </Tooltip>
                  </Box>
                  {/* Abschnitts-Titel wie im Matrix-Pack — hier ist alles geplant. */}
                  <Typography
                    sx={{
                      fontSize: '0.56rem',
                      fontWeight: 700,
                      letterSpacing: 0.3,
                      textTransform: 'uppercase',
                      color: 'text.secondary',
                      px: 0.25,
                    }}
                  >
                    Geplant ({slot.caseIds.length})
                  </Typography>
                  {slot.caseIds.length === 0 ? (
                    <Typography
                      sx={{
                        display: 'block',
                        px: 0.25,
                        py: 0.25,
                        color: 'text.secondary',
                        fontSize: '0.58rem',
                      }}
                    >
                      Leer — Belege aus der digitalen Ablage hierher ziehen.
                    </Typography>
                  ) : (
                    slot.caseIds.map((caseId, idx) => {
                      const info = caseById.get(caseId);
                      const weNo = weNoOf(caseId);
                      // Beleg-Strich wie in der Matrix: Statusfarbe als Kante,
                      // geplant = neutral (stripStyle liefert dann null).
                      const style = info !== undefined ? stripStyle(info.status) : null;
                      const farbe = style?.color;
                      return (
                        <Box
                          key={caseId}
                          draggable={!locked}
                          onDragStart={(e) => {
                            if (e.dataTransfer) {
                              e.dataTransfer.effectAllowed = 'move';
                              e.dataTransfer.setData('text/plain', weNo);
                            }
                            onDragStart({ source: 'vorschlag', caseId, weBelegNo: weNo, slot: i });
                          }}
                          onDragEnd={onDragEnd}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 0.25,
                            px: 0.5,
                            py: 0.25,
                            borderRadius: 0.5,
                            borderLeft: '3px solid',
                            borderLeftColor: farbe ?? 'divider',
                            bgcolor: farbe ? alpha(farbe, 0.1) : 'action.hover',
                            cursor: locked ? 'default' : 'grab',
                          }}
                        >
                          <Typography
                            sx={{
                              fontSize: '0.66rem',
                              fontWeight: 600,
                              color: style?.color,
                              textDecoration: style?.strike ? 'line-through' : 'none',
                              flex: 1,
                              minWidth: 0,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {idx + 1}. {weNo}
                          </Typography>
                          <Typography
                            variant="caption"
                            sx={{ color: 'text.secondary', fontSize: '0.6rem', flexShrink: 0 }}
                          >
                            {info !== undefined ? `${info.teile} Teile` : '—'}
                          </Typography>
                          <IconButton
                            size="small"
                            aria-label={`${weNo} nach oben`}
                            disabled={locked || idx === 0}
                            onClick={() => moveCaseInSlot(i, idx, -1)}
                            sx={{ p: 0.25 }}
                          >
                            <ArrowUpwardIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label={`${weNo} nach unten`}
                            disabled={locked || idx === slot.caseIds.length - 1}
                            onClick={() => moveCaseInSlot(i, idx, 1)}
                            sx={{ p: 0.25 }}
                          >
                            <ArrowDownwardIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                          <IconButton
                            size="small"
                            aria-label={`${weNo} aus dem Bündel nehmen`}
                            disabled={locked}
                            onClick={() => removeCase(i, caseId)}
                            sx={{ p: 0.25 }}
                          >
                            <CloseIcon sx={{ fontSize: 12 }} />
                          </IconButton>
                        </Box>
                      );
                    })
                  )}
                </Paper>
              );
            })}
          </Box>
        )}
        {slots !== null && slots.length > 0 && (
          // EIN Container (Nutzer-Vorgabe): die MA-Vorschläge untereinander
          // 1./2./3. — neben jedem Namen der Fortschrittsbalken des aktuellen
          // Bündels (wie weit der MA durch ist) + die Frei-Prognose. Schmaler als
          // die Karte und darin mittig (mx auto wirkt auch im Flex-Fluss).
          <Paper
            variant="outlined"
            sx={{ mt: 0.75, mx: 'auto', p: 0.5, borderRadius: 1, maxWidth: 520, width: '100%' }}
          >
            <Typography
              sx={{
                fontSize: '0.56rem',
                fontWeight: 700,
                letterSpacing: 0.3,
                textTransform: 'uppercase',
                color: 'text.secondary',
                px: 0.25,
                mb: 0.25,
              }}
            >
              Demnächst frei — für wen vorbereitet wird
            </Typography>
            <Stack spacing={0.25}>
              {slots.map((slot, i) => {
                const worker = workerById.get(slot.employeeId);
                return (
                  // Je MA-Zeile ein eigener Kasten (Nutzer-Vorgabe).
                  <Paper
                    key={`ma-${i}`}
                    variant="outlined"
                    sx={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 0.75,
                      px: 0.5,
                      py: 0.375,
                      borderRadius: 1,
                    }}
                  >
                    <Typography
                      sx={{ fontSize: '0.7rem', fontWeight: 700, width: 150, flexShrink: 0 }}
                      noWrap
                    >
                      {i + 1}. {worker?.name ?? slot.employeeId}
                    </Typography>
                    <Tooltip title={`Bündel-Fortschritt: ${worker?.fortschrittPct ?? 0} %`}>
                      <LinearProgress
                        variant="determinate"
                        value={worker?.fortschrittPct ?? 0}
                        data-testid={`ma-fortschritt-${i}`}
                        sx={{ flex: 1, height: 6, borderRadius: 3 }}
                      />
                    </Tooltip>
                    <Typography
                      sx={{
                        fontSize: '0.62rem',
                        color: 'text.secondary',
                        width: 34,
                        textAlign: 'right',
                        flexShrink: 0,
                      }}
                    >
                      {worker?.fortschrittPct ?? 0} %
                    </Typography>
                    <Typography
                      variant="caption"
                      sx={{
                        color: 'text.secondary',
                        fontSize: '0.62rem',
                        flexShrink: 0,
                        minWidth: 96,
                        textAlign: 'right',
                      }}
                    >
                      {worker === undefined
                        ? 'nicht im Board'
                        : worker.restMinutes === 0
                          ? 'jetzt frei'
                          : `frei in ≈ ${worker.restMinutes} Min`}
                      {worker?.paused === true ? ' · pausiert' : ''}
                    </Typography>
                  </Paper>
                );
              })}
            </Stack>
          </Paper>
        )}
          </>
        )}
      </Box>

      {ansicht === 'starter' ? (
        <Button
          variant="outlined"
          onClick={verlasseStarter}
          sx={{ alignSelf: 'center', flexShrink: 0, borderRadius: 0.5, px: 3, fontWeight: 700 }}
        >
          Zurück zur Vorverteilung
        </Button>
      ) : dragging?.source === 'vorschlag' && !locked ? (
        <Box
          onDragOver={(e) => {
            e.preventDefault();
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
            setOverRemove(true);
          }}
          onDragLeave={() => setOverRemove(false)}
          onDrop={() => {
            if (dragging?.source === 'vorschlag') removeCase(dragging.slot, dragging.caseId);
            setOverRemove(false);
            onDragEnd();
          }}
          sx={{
            flexShrink: 0,
            border: '2px dashed',
            borderColor: overRemove ? 'error.main' : 'divider',
            borderRadius: 1,
            p: 0.75,
            textAlign: 'center',
            fontSize: '0.7rem',
            color: 'text.secondary',
          }}
        >
          Hierher ziehen: zurück in die digitale Ablage (Beleg aus dem Vorschlag nehmen)
        </Box>
      ) : (
        // Statt des früheren Vorschau-Hinweises (Nutzer-Vorgabe): Einstieg in
        // die Starterbündel-Ansicht — rechteckig, zentriert.
        <Button
          variant="outlined"
          onClick={() => setAnsicht('starter')}
          sx={{ alignSelf: 'center', flexShrink: 0, borderRadius: 0.5, px: 3, fontWeight: 700 }}
        >
          Starterbündel
        </Button>
      )}

      <Popover
        open={gearAnchor !== null}
        anchorEl={gearAnchor}
        onClose={() => setGearAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack sx={{ p: 1.5, width: 300 }} spacing={1.25}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>Vorverteilung</Typography>
          <TextField
            size="small"
            type="number"
            label="Bündel vorbereiten (nächste freie Mitarbeiter)"
            value={settings.count}
            onChange={(e) =>
              saveSettings({
                ...settings,
                count: Math.min(6, Math.max(1, Math.round(Number(e.target.value) || 1))),
              })
            }
            slotProps={{ htmlInput: { min: 1, max: 6 } }}
            helperText="Für so viele demnächst freie Mitarbeiter wird je ein Bündel vorbereitet."
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={settings.locked}
                onChange={(e) => saveSettings({ ...settings, locked: e.target.checked })}
              />
            }
            label="Vorverteilung sperren"
          />
          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Gesperrt: Der Vorschlag wird weder neu berechnet noch verändert.
          </Typography>
        </Stack>
      </Popover>

      {/* Einstellungen der Starterbündel-Karte: Übernahme-Art + Vorlauf. */}
      <Popover
        open={starterGearAnchor !== null}
        anchorEl={starterGearAnchor}
        onClose={() => setStarterGearAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        <Stack sx={{ p: 1.5, width: 320 }} spacing={1}>
          <Typography sx={{ fontWeight: 800, fontSize: '0.8rem' }}>Starterbündel</Typography>
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={settings.starterAuto}
                onChange={(e) => saveSettings({ ...settings, starterAuto: e.target.checked })}
              />
            }
            label="Automatisch übernehmen"
          />
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={settings.starterAutoErstellen}
                onChange={(e) =>
                  saveSettings({ ...settings, starterAutoErstellen: e.target.checked })
                }
              />
            }
            label="Automatisch erstellen"
          />

          {/* Vorlauf: wie lange VOR Schichtbeginn das Bündel vorgebaut wird.
              Entweder ein Wert für alle — oder je Schichttyp aufgeteilt; dann
              tritt der einzelne Wert an die Stelle des gemeinsamen. */}
          {!vorlaufJeSchichtAktiv && (
            <TextField
              select
              size="small"
              label="Vorlauf vor Schichtbeginn"
              value={settings.starterVorlaufStunden}
              onChange={(e) =>
                saveSettings({ ...settings, starterVorlaufStunden: Number(e.target.value) })
              }
            >
              {STARTER_VORLAUF_OPTIONEN.map((h) => (
                <MenuItem key={h} value={h}>
                  {stundenLabel(h)}
                </MenuItem>
              ))}
            </TextField>
          )}
          <FormControlLabel
            control={
              <Switch
                size="small"
                checked={vorlaufJeSchichtAktiv}
                onChange={(e) =>
                  saveSettings({
                    ...settings,
                    starterVorlaufJeSchicht: e.target.checked
                      ? vorlaufJeSchichtAus(settings.starterVorlaufStunden)
                      : {},
                  })
                }
              />
            }
            label="Vorlauf je Schichttyp"
          />
          {vorlaufJeSchichtAktiv &&
            STARTER_SCHICHTTYPEN.map((t) => (
              <TextField
                key={t.kind}
                select
                size="small"
                label={t.label}
                value={settings.starterVorlaufJeSchicht[t.kind] ?? settings.starterVorlaufStunden}
                onChange={(e) =>
                  saveSettings({
                    ...settings,
                    starterVorlaufJeSchicht: {
                      ...settings.starterVorlaufJeSchicht,
                      [t.kind]: Number(e.target.value),
                    },
                  })
                }
              >
                {STARTER_VORLAUF_OPTIONEN.map((h) => (
                  <MenuItem key={h} value={h}>
                    {stundenLabel(h)}
                  </MenuItem>
                ))}
              </TextField>
            ))}

          <Typography variant="caption" sx={{ color: 'text.secondary' }}>
            Übernehmen aus: Vorschläge erscheinen orange und müssen einzeln per Klick übernommen
            werden; an: Übernahme ohne Klick. Erstellen an: der Vorschlag wird automatisch
            generiert, sobald jemand im eingestellten Vorlauf startet (auch im Hintergrund).
            Der Vorlauf bestimmt zugleich, wer in dieser Ansicht überhaupt auftaucht — mit
            „Vorlauf je Schichttyp" darf die Frühschicht früher vorbauen als die Spätschicht.
            Die echte Zuweisung erfolgt stets exakt zum Schichtbeginn.
          </Typography>
        </Stack>
      </Popover>

      <Menu
        open={maMenu !== null}
        anchorEl={maMenu?.anchor ?? null}
        onClose={() => setMaMenu(null)}
      >
        {workers.map((w) => (
          <MenuItem
            key={w.employeeId}
            selected={maMenu !== null && slots?.[maMenu.slot]?.employeeId === w.employeeId}
            onClick={() => {
              if (maMenu !== null)
                setSlots(
                  (prev) =>
                    prev?.map((s, idx) =>
                      idx === maMenu.slot ? { ...s, employeeId: w.employeeId } : s,
                    ) ?? prev,
                );
              setMaMenu(null);
            }}
          >
            <Stack>
              <Typography sx={{ fontSize: '0.8rem', fontWeight: 600 }}>{w.name}</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {w.restMinutes === 0 ? 'jetzt frei' : `frei in ≈ ${w.restMinutes} Min`}
                {w.paused ? ' · pausiert' : ''}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </Stack>
  );
}

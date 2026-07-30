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
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import SettingsIcon from '@mui/icons-material/Settings';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { alpha } from '@mui/material/styles';
import { isManualOnlyTier } from '../../components/TierChip.js';
import { fetchEmployees } from '../../data/employees.js';
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

/** Zahnrad-Einstellungen der Vorverteilung (Saved View). */
interface VorverteilungSettings {
  /** Für so viele demnächst freie Mitarbeiter wird je ein Bündel vorbereitet. */
  count: number;
  /** Gesperrt: Vorschlag wird weder neu berechnet noch verändert. */
  locked: boolean;
}

function sanitizeSettings(raw: Partial<VorverteilungSettings> | null): VorverteilungSettings {
  const count =
    typeof raw?.count === 'number' && Number.isFinite(raw.count)
      ? Math.min(6, Math.max(1, Math.round(raw.count)))
      : 3;
  return { count, locked: raw?.locked === true };
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
  const { board, lanes, preview } = useCockpitData();
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

  return (
    <Stack sx={{ height: '100%', minHeight: 0, p: 1, gap: 0.75 }}>
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
          // Bündels (wie weit der MA durch ist) + die Frei-Prognose.
          <Paper variant="outlined" sx={{ mt: 0.75, p: 0.5, borderRadius: 1 }}>
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
      </Box>

      {dragging?.source === 'vorschlag' && !locked ? (
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
        <Typography variant="caption" sx={{ color: 'text.secondary', flexShrink: 0 }}>
          Vorschau — verbindlich erst beim Zuweisen: Bündel-Kopf auf eine Zeile der
          Mitarbeiter-Matrix ziehen. Belege lassen sich aus der digitalen Ablage hierher ziehen;
          „✕" legt sie dorthin zurück.
        </Typography>
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

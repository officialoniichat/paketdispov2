/**
 * PROCESS phase — the single per-Beleg work screen.
 *
 * The WE Beleg-Nr. is the hero (C1); the Kopf shows Kartons (C2) and the
 * Warenart wording instead of Abschnitt numbers (C3), plus the Beleg's
 * aggregated CatMan-Termin (frühester Termin über Kopf + Positionen, vom Backend
 * berechnet) — man muss ihn nicht mehr in den Positionszeilen suchen; die
 * Positions-Chips bleiben die Detail-Quelle. Ein überschrittener Termin ist rot
 * als „überfällig" markiert: reine Kontrollinformation, kein Prioritätstreiber.
 * The Arbeitsanweisung is
 * ordered Prüfung Wareneingang → Rotpreis → Boxzettel (C4); the Prüfstufe is
 * explained in a tooltip on an info icon (C5). Positions carry the Preisetikett
 * placement with the Sicherungsetikett pictogram (C6).
 *
 * Positions are ONE table with a STICKY column header (A1 + Kundenfeedback
 * 14.07.2026, Punkt 3), so every Größe-row carries its values at the same
 * x-position and EK/VK/VK-Etikett/Etikettpreis sit right-aligned at the right
 * edge. Each Größe is its own row with +/- Mehr-/Mindermengen capture (D2) and
 * the Etikettpreis input (Punkt 4, Betragsanzeige mit €-Zeichen: „40" wird zu
 * „40,00 €"). Die Positions-Kopfzelle stapelt unter der
 * Pos-Nr. die Kontextfelder (Nachtrag 15.07.2026): HS, Shop, CatMan-Termin,
 * Etage, Filiale, Shopbereich. Der frühere Boxzettel-Abschnitt entfällt — seine
 * Infos (Filiale, Shopbereich, Shop, Etage, Warenart) stehen jetzt an der
 * Position; die Ordernummer ist nur noch in der Teamlead-UX sichtbar.
 *
 * Probleme werden pro Position/Größe im Dialog erfasst (Punkt 5), lokal
 * gesammelt und farblich markiert (Punkt 9): ein Problem mit Größe färbt seine
 * Größenzeile rot, ein Problem ohne Größe („Ganze Position") die komplette
 * Position samt Kopfzeile; der beleg-weite Problem-Einstieg
 * ist entfallen (Punkt 8). Eine Mehr-/Minderlieferung oder Preisabweichung ist
 * automatisch ein Problem (Punkt 7): „Beleg erledigt" ist dann gesperrt, nur der
 * Teilabschluss (mit gesammelten Problemen, Punkt 10) bleibt.
 *
 * Fertige/gesperrte Belege (completed, zst_done, issue_open, cancelled) öffnen
 * als reine Ansicht (`flow.readOnly`): Hinweis-Banner statt Aktionen, Werte
 * statt Eingabe-Controls — kein Start-Übergang mehr für erledigte Belege.
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import type { SvgIconComponent } from '@mui/icons-material';
import AutorenewOutlinedIcon from '@mui/icons-material/AutorenewOutlined';
import CheckIcon from '@mui/icons-material/Check';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PriceChangeOutlinedIcon from '@mui/icons-material/PriceChangeOutlined';
import PublicOutlinedIcon from '@mui/icons-material/PublicOutlined';
import {
  DEFAULT_WGR_CATALOG,
  labelPrintRequired,
  labelPrintVariantText,
  printedPriceCheckRequired,
  summarizeLabelPrintVariants,
  type CaseStatus,
  type LabelPrintVariant,
  type OnlineSizeMark,
} from '@paket/domain-types';
import { CaseCardSkeleton, touchTarget } from '@paket/ui';
import { CatManChip } from '../components/CatManChip.js';
import { StepScaffold } from '../components/StepScaffold.js';
import { oskProps } from '../components/OnScreenKeyboard.js';
import { ProblemDialog } from '../components/ProblemDialog.js';
import { TeilabschlussDialog } from '../components/TeilabschlussDialog.js';
import { apiBaseUrl } from '../data/api.js';
import { useReferenceDay } from '../data/useMeToday.js';
import type { PositionView } from '../domain/types.js';
import { useCaseFlow } from '../workflow/useCaseFlow.js';
import { canCompleteCase } from '../workflow/workflowModel.js';
import { TAGESSTART } from '../routes/paths.js';

/**
 * Arbeitsanweisung points that are already performed via dedicated controls
 * ("Beleg erledigt" sets the ZST) or are upstream (printing is vorgelagert, C4)
 * — hidden from the read-only Arbeitsanweisung list.
 */
const ACTION_POINT_KEYS = new Set(['price_label_print', 'price_label_attach', 'zst']);

/**
 * C4 display order: Sortieren, Prüfung, Sicherungsetikett, Rotpreis, Boxzettel.
 * Unlisted keys (Online) sort last.
 */
const POINT_DISPLAY_ORDER: Record<string, number> = {
  sort: 0,
  goods_receipt_check: 1,
  security: 2,
  red_price: 3,
  box_label: 4,
  online_handling: 5,
};

/** German labels of the Sicherungstyp pictograms (mirrors the backend assets). */
const PICTOGRAM_LABEL: Record<string, string> = {
  'hard-tag': 'Hartetikett',
  'ink-tag': 'Farbetikett',
  'spider-wrap': 'Spinnensicherung',
  'safer-box': 'Safer-Box',
  'cable-lock': 'Kabelschloss',
};

/** WGR-Klartext (D3) — resolved from the same mock master data the backend uses. */
const WGR_DESCRIPTION = new Map(DEFAULT_WGR_CATALOG.map((e) => [e.wgr, e.description]));

const EUR = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

/** Format a price, or empty when the mock ERP did not deliver one. */
function price(value: number | undefined): string | null {
  return typeof value === 'number' ? EUR.format(value) : null;
}

/**
 * D4: chip colour + wording of the Online-Größen-Markierung. Bewusst kurz, damit
 * der Chip in der „Online"-Spalte vollständig lesbar bleibt (nie abgeschnitten).
 */
const ONLINE_MARK: Record<OnlineSizeMark, { label: string; color: 'success' | 'error' }> = {
  green: { label: 'Online-Highlight', color: 'success' },
  red: { label: 'Online', color: 'error' },
};

/** Pictogram asset URL (backend-served); undefined in offline-demo mode. */
function pictogramUrl(code: string): string | undefined {
  return apiBaseUrl ? `${apiBaseUrl}/static/pictograms/${code}.svg` : undefined;
}

/** Piktogramm-Code des Preisetikett-Schritts (Punkt 8 „Preisetiketten anbringen"). */
const ETIKETT_PICTOGRAM_CODE = 'preis-etikett';

/**
 * Ein Arbeitsschritt (Preisetikett/Sicherung) als illustrierte Karte im Stil der
 * L+T-Arbeitsanweisung: große Line-Art-Grafik oben (die Preisetikett-Grafik ist
 * die aus der AW vektorisierte Handschuh-Zeichnung), darunter Titel + Ort
 * (Nachtrag 15.07.2026).
 */
function WorkStepPictogram({
  code,
  title,
  subtitle,
}: {
  code: string;
  title: string;
  subtitle?: string;
}): JSX.Element {
  const url = pictogramUrl(code);
  return (
    <Stack
      alignItems="center"
      spacing={0.5}
      sx={{
        px: 2,
        py: 1.25,
        minWidth: 156,
        maxWidth: 220,
        borderRadius: 3,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: 'grey.50',
      }}
    >
      {url ? (
        <Box
          sx={{
            width: '100%',
            height: 104,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Box
            component="img"
            src={url}
            alt=""
            sx={{ maxHeight: '100%', maxWidth: 140, width: 'auto' }}
          />
        </Box>
      ) : null}
      <Typography sx={{ fontWeight: 700, textAlign: 'center', lineHeight: 1.2 }}>
        {title}
      </Typography>
      {subtitle ? (
        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center' }}>
          {subtitle}
        </Typography>
      ) : null}
    </Stack>
  );
}

/**
 * Deutsche Betragsdarstellung der Etikettpreis-Eingabe ohne Währungszeichen
 * („40" → „40,00"). Ohne Tausender-Gruppierung, damit der formatierte Text
 * selbst wieder gültige Eingabe ist und beim Fokussieren unverändert stehen
 * bleiben kann.
 */
const PRICE_INPUT_FORMAT = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: false,
});

/** Erlaubte Preis-Eingabe: Ziffern mit optionalem Komma-/Punkt-Dezimalteil (max. 2 Stellen). */
const PRICE_INPUT_PATTERN = /^\d*(?:[.,]\d{0,2})?$/;

/**
 * Punkt 4: Etikettpreis-Eingabe je Größe. Das €-Zeichen steht PERMANENT im
 * Feld — auch leer neben dem Platzhalter („Preis … €") — und ein erfasster
 * Wert erscheint als Betrag („40,00 €") statt als blanke Zahl; während der
 * Eingabe bleibt das Feld frei editierbar (Komma oder Punkt als
 * Dezimaltrenner). Die Fachlogik (Preis gleich VK-Etikett = keine Korrektur)
 * bleibt im workflowModel — hier ist nur Darstellung.
 */
function EtikettpreisInput({
  sizeLabel,
  corrected,
  onChange,
}: {
  sizeLabel: string;
  corrected: number | undefined;
  onChange: (price: number | undefined) => void;
}): JSX.Element {
  // Während des Tippens zählt der Rohtext; ohne Fokus die formatierte Zahl.
  const [editing, setEditing] = useState<string | null>(null);
  const display = editing ?? (corrected !== undefined ? PRICE_INPUT_FORMAT.format(corrected) : '');
  return (
    <TextField
      size="small"
      placeholder="Preis"
      value={display}
      onBlur={() => setEditing(null)}
      onChange={(e) => {
        const raw = e.target.value;
        if (!PRICE_INPUT_PATTERN.test(raw)) return;
        setEditing(raw);
        const parsed = Number(raw.replace(',', '.'));
        onChange(raw === '' || Number.isNaN(parsed) ? undefined : parsed);
      }}
      slotProps={{
        input: {
          endAdornment: <InputAdornment position="end">€</InputAdornment>,
        },
        htmlInput: {
          ...oskProps('decimal'),
          'aria-label': `Größe ${sizeLabel}: Etikettpreis erfassen`,
          style: { textAlign: 'right' },
        },
      }}
      sx={{ width: 120 }}
    />
  );
}

/**
 * Kundenfeedback 03.08.2026: der frühere generische „Etikett"-Chip sagte nur
 * „irgendein Etikett". Er ist durch die konkrete Druckvariante ersetzt
 * ({@link LabelPrintVariantChip}) — genau daran erkennt der Mitarbeiter, ob er am
 * Drucker die Preisunterdrückung einstellen muss.
 */
const FLAG_CHIPS: ReadonlyArray<{
  key: string;
  label: string;
  Icon: SvgIconComponent;
  color: 'warning' | 'info' | 'error';
}> = [
  { key: 'securityRequired', label: 'Sicherung', Icon: LockOutlinedIcon, color: 'warning' },
  { key: 'onlineHandlingRequired', label: 'Online', Icon: PublicOutlinedIcon, color: 'info' },
  { key: 'redPriceRequired', label: 'Rotpreis', Icon: PriceChangeOutlinedIcon, color: 'error' },
];

/** Chip-Farbe je Variante; Wording/Reihenfolge kommen aus domain-types. */
const VARIANT_CHIP_COLOR: Record<LabelPrintVariant, 'default' | 'secondary'> = {
  etikett_mit_preis: 'default',
  digitag_etikett_ohne_preis: 'secondary',
  kein_etikett: 'default',
};

function LabelPrintVariantChip({ variant }: { variant: LabelPrintVariant }): JSX.Element {
  return (
    <Chip
      size="small"
      color={VARIANT_CHIP_COLOR[variant]}
      variant={variant === 'kein_etikett' ? 'outlined' : 'filled'}
      label={labelPrintVariantText(variant)}
    />
  );
}

/** Eine Spalte der Positionen-Tabelle; `weight` wird zur Prozentbreite normalisiert. */
interface PositionColumn {
  key: string;
  label: string;
  align?: 'right' | 'center';
  weight: number;
}

/**
 * Feste Spalten der Positionen-Tabelle (A1). Die Online-Spalte entfällt, wenn der
 * Beleg keine online-relevante Position hat — innerhalb eines Belegs bleibt die
 * Geometrie damit konstant. „Etikettpreis" steht direkt hinter „VK-Etikett" und
 * entfällt komplett, wenn KEINE Position ein Etikett mit aufgedrucktem Preis
 * bekommt (Kundenfeedback 03.08.2026): dann gibt es auf dem ganzen Beleg keinen
 * gedruckten Preis zu prüfen.
 */
function positionColumns(hasOnlineMarks: boolean, hasPrintedPrices: boolean): PositionColumn[] {
  const columns: PositionColumn[] = [
    { key: 'pos', label: 'Pos', weight: 7 },
    { key: 'ean', label: 'EAN', weight: 12 },
    { key: 'size', label: 'Größe', weight: 6 },
    { key: 'expected', label: 'Soll', align: 'right', weight: 5 },
    { key: 'actual', label: 'Ist', align: 'center', weight: 13 },
    { key: 'deviation', label: 'Mehr-/Mindermenge', weight: 13 },
    { key: 'ek', label: 'EK', align: 'right', weight: 9 },
    { key: 'vk', label: 'VK', align: 'right', weight: 9 },
    { key: 'vkLabel', label: 'VK-Etikett', align: 'right', weight: 10 },
  ];
  if (hasPrintedPrices) {
    columns.push({ key: 'vkCorrected', label: 'Etikettpreis', align: 'right', weight: 13 });
  }
  if (hasOnlineMarks) columns.splice(3, 0, { key: 'online', label: 'Online', weight: 14 });
  return columns;
}

/** Ziffern in Zahlenspalten laufen einspurig, sonst wandert das Komma je Zeile. */
const NUMERIC_CELL = { fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } as const;

/** Die Tabelle wird dichter, die Touch-Ziele nicht: bedient wird ggf. mit Handschuhen. */
const TOUCH_TARGET_MIN = touchTarget.min;

const STEPPER_BUTTON = {
  width: TOUCH_TARGET_MIN,
  height: TOUCH_TARGET_MIN,
  fontSize: '1.5rem',
  fontWeight: 700,
  border: '1px solid',
  borderColor: 'divider',
} as const;

/**
 * Punkt 9: die EINE rote Problem-Markierung der Tabelle — identisch für
 * Mengenabweichung, Preisabweichung und manuell gemeldete Probleme, auf
 * Größenzeilen wie Positions-Kopfzeilen.
 */
const PROBLEM_ROW_SX = {
  bgcolor: 'rgba(211, 47, 47, 0.08)',
  borderLeft: '3px solid',
  borderLeftColor: 'error.main',
} as const;

/**
 * Nur-Ansicht-Hinweis je Beleg-Status: ein fertiger/gesperrter Beleg lässt sich
 * weiterhin öffnen und ansehen, aber nicht mehr bearbeiten — vorher stieß der
 * erste Tipper einen illegalen Start-Übergang an (completed → in_progress).
 */
const READ_ONLY_NOTICE: Partial<Record<CaseStatus, { severity: 'success' | 'warning' | 'info'; text: string }>> = {
  completed: {
    severity: 'success',
    text: 'Dieser Beleg ist bereits erledigt. Nur Ansicht – Änderungen sind nicht mehr möglich.',
  },
  zst_done: {
    severity: 'success',
    text: 'Dieser Beleg ist erledigt und im Tagesabschluss verbucht. Nur Ansicht.',
  },
  issue_open: {
    severity: 'warning',
    text: 'Problem gemeldet – wartet auf Klärung durch die Teamleitung. Nur Ansicht.',
  },
  cancelled: { severity: 'info', text: 'Dieser Beleg wurde storniert. Nur Ansicht.' },
};

const READ_ONLY_FALLBACK = {
  severity: 'info',
  text: 'Dieser Beleg ist aktuell nicht bearbeitbar. Nur Ansicht.',
} as const;

export function BelegProcessScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);
  // Bezugstag der Überfälligkeits-Anzeige — derselbe Server-Tag wie im Bündel-Home.
  const referenceDay = useReferenceDay();
  const [partialOpen, setPartialOpen] = useState(false);
  const [problemTarget, setProblemTarget] = useState<PositionView | null>(null);

  if (flow.isError) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert
          severity="error"
          action={
            <Button color="inherit" size="small" onClick={flow.refetch}>
              Erneut versuchen
            </Button>
          }
        >
          Verbindung fehlgeschlagen. Bitte erneut versuchen.
        </Alert>
      </Box>
    );
  }

  if (flow.loading || !flow.aggregate || !flow.progress) {
    return (
      <Box sx={{ p: 2 }}>
        <CaseCardSkeleton />
      </Box>
    );
  }

  const { aggregate, progress, readOnly } = flow;
  const wi = aggregate.workInstruction;
  const readOnlyNotice = readOnly
    ? (READ_ONLY_NOTICE[aggregate.case.status] ?? READ_ONLY_FALLBACK)
    : undefined;
  const gate = canCompleteCase(progress, aggregate);
  // Teilabschluss ist nur möglich, wenn mindestens ein Problem vorliegt (das
  // Backend würde sonst ablehnen). Ein Problem = manuell erfasst ODER implizit
  // (Mengen-/Preisabweichung).
  const problemCount =
    progress.problems.length +
    Object.keys(progress.confirmedQuantities).length +
    Object.keys(progress.correctedVkPrices).length;
  const checked = new Set(progress.quantityCheckedPositionIds);
  const infoPoints = [...aggregate.instructionPoints]
    .filter((p) => !ACTION_POINT_KEYS.has(p.key))
    .sort((a, b) => (POINT_DISPLAY_ORDER[a.key] ?? 99) - (POINT_DISPLAY_ORDER[b.key] ?? 99));
  const c = aggregate.case;
  const positionWarenart = (pos: PositionView): string | undefined =>
    pos.nosFlag ? 'NOS' : (c.goodsTypeText ?? undefined);
  // Manuell erfasste Probleme je Position (für die farbliche Markierung, Punkt 9).
  const manualByPosition = new Map<string, typeof progress.problems>();
  for (const problem of progress.problems) {
    manualByPosition.set(problem.positionId, [
      ...(manualByPosition.get(problem.positionId) ?? []),
      problem,
    ]);
  }

  const hasOnlineMarks = aggregate.positions.some((pos) =>
    pos.skuLines.some((s) => aggregate.onlineMarks[s.id]),
  );
  // Etikett-Varianten des Belegs (nur die tatsächlich vorkommenden) — Kopf-Überblick
  // und Sichtbarkeit der Etikettpreis-Spalte hängen daran.
  const belegVariants = summarizeLabelPrintVariants(
    aggregate.positions.map((pos) => pos.instruction.labelPrintVariant),
  );
  const hasPrintedPrices = belegVariants.some(printedPriceCheckRequired);
  const columns = positionColumns(hasOnlineMarks, hasPrintedPrices);
  const totalWeight = columns.reduce((sum, col) => sum + col.weight, 0);
  const widthOf = (col: PositionColumn): string =>
    `${((col.weight / totalWeight) * 100).toFixed(3)}%`;

  const finish = async (): Promise<void> => {
    const ok = await flow.complete();
    if (ok) navigate(TAGESSTART);
  };

  const confirmPartial = async (): Promise<void> => {
    const ok = await flow.partialComplete();
    if (ok) {
      setPartialOpen(false);
      navigate(TAGESSTART);
    }
  };

  return (
    <StepScaffold
      where={`Lagerplatz ${aggregate.case.storageLocation?.code ?? '—'}`}
      title={`WE ${aggregate.case.weBelegNo}`}
      onBack={() => navigate(TAGESSTART)}
      primary={readOnly ? undefined : { label: 'Beleg erledigt', onClick: finish, disabled: !gate.ok }}
      secondary={
        readOnly
          ? undefined
          : {
              label: 'Teilabschluss (Problem melden)',
              onClick: () => setPartialOpen(true),
              disabled: problemCount === 0,
            }
      }
    >
      <Stack spacing={2}>
        {readOnlyNotice ? (
          <Alert severity={readOnlyNotice.severity}>{readOnlyNotice.text}</Alert>
        ) : null}
        {/* Kompakte Fakten-Leiste: Warenart · Menge · CatMan-Termin — scanbar,
            ohne Fließtext (Nachtrag 15.07.2026). Der CatMan-Termin ist der vom
            Backend aggregierte früheste Termin des Belegs: er steht hier im Kopf,
            damit man ihn nicht erst in den Positionszeilen suchen muss. Die
            Positions-Chips unten bleiben die Detail-Quelle (welche Position
            wann fällig ist). */}
        <Stack
          direction="row"
          spacing={2.5}
          alignItems="center"
          sx={{ flexWrap: 'wrap', rowGap: 1 }}
        >
          {c.goodsTypeText ? (
            <Chip color="secondary" sx={{ fontWeight: 700 }} label={c.goodsTypeText} />
          ) : null}
          <Box>
            <Typography component="span" sx={{ fontWeight: 800, fontSize: '1.15rem' }}>
              {c.totalQuantity}
            </Typography>{' '}
            <Typography component="span" variant="body2" color="text.secondary">
              Teile
            </Typography>
          </Box>
          <CatManChip date={c.catManDate} referenceDay={referenceDay} size="medium" />
        </Stack>

        {/* Kundenfeedback 03.08.2026: WELCHE Etikett-Varianten stecken in diesem
            Beleg? Nur die tatsächlich vorkommenden — ein einheitlicher Beleg zeigt
            genau eine. Dieselbe Zusammenfassung steht unter „1 · Ware holen". */}
        {belegVariants.length > 0 ? (
          <Stack direction="row" alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.75 }}>
            <Typography variant="body2" color="text.secondary">
              Etiketten:
            </Typography>
            {belegVariants.map((variant) => (
              <LabelPrintVariantChip key={variant} variant={variant} />
            ))}
          </Stack>
        ) : null}

        {/* Arbeitsanweisung — faithful ordered points minus the upstream/ZST ones. */}
        {infoPoints.length > 0 ? (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Arbeitsanweisung
            </Typography>
            <Stack spacing={0.75}>
              {infoPoints.map((point, index) => {
                const isInspection = point.key === 'goods_receipt_check';
                return (
                  <Box key={point.key} sx={{ display: 'flex', gap: 1, alignItems: 'baseline' }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, minWidth: 22, color: 'text.secondary' }}
                    >
                      {index + 1}
                    </Typography>
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography
                        variant="body2"
                        sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}
                      >
                        {point.label}
                        {isInspection && aggregate.inspectionLevelLabel
                          ? ` · ${aggregate.inspectionLevelLabel}`
                          : ''}
                        {isInspection && aggregate.inspectionDescription ? (
                          <Tooltip
                            title={aggregate.inspectionDescription}
                            arrow
                            enterTouchDelay={0}
                            leaveTouchDelay={8000}
                          >
                            <InfoOutlinedIcon
                              fontSize="small"
                              tabIndex={0}
                              aria-label={`Was heißt das? ${aggregate.inspectionDescription}`}
                              sx={{
                                color: 'text.secondary',
                                cursor: 'help',
                                p: '6px',
                                boxSizing: 'content-box',
                              }}
                            />
                          </Tooltip>
                        ) : null}
                      </Typography>
                      {!(isInspection && aggregate.inspectionLevelLabel === point.value) ? (
                        <Typography variant="body2" color="text.secondary">
                          {point.value}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>
                );
              })}
            </Stack>
          </Paper>
        ) : null}

        <Typography variant="subtitle2">Positionen</Typography>
        {!readOnly && wi.goodsReceiptCheckMode === 'quantity_only' ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: -1 }}>
            Jede Position prüfen – auch bei Prüfung Wareneingang = „Nein".
          </Typography>
        ) : null}
        {!readOnly ? (
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            Dieser Fortschritt geht beim Neuladen der Seite verloren – erst „Beleg erledigt" oder
            der Teilabschluss sichert ihn dauerhaft.
          </Typography>
        ) : null}
        {/* A1: EINE Tabelle über alle Positionen mit STICKY Kopfzeile (Punkt 3). Die
            Tabelle scrollt vertikal in ihrem Container; die Spaltenüberschriften
            bleiben oben stehen. EK/VK/VK-Etikett/Etikettpreis stehen rechts. */}
        <Paper variant="outlined">
          <TableContainer sx={{ overflowX: 'auto', maxHeight: 'calc(100dvh - 340px)' }}>
            <Table
              stickyHeader
              aria-label="Positionen"
              sx={{
                tableLayout: 'fixed',
                minWidth: 1440,
                '& .MuiTableCell-root': { fontSize: '1.0625rem', py: 1 },
              }}
            >
              <colgroup>
                {columns.map((col) => (
                  <col key={col.key} style={{ width: widthOf(col) }} />
                ))}
              </colgroup>
              <TableHead>
                <TableRow>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align}
                      sx={{ fontWeight: 700, whiteSpace: 'nowrap', bgcolor: 'background.paper' }}
                    >
                      {col.label}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              {aggregate.positions.map((pos) => {
                const soll = pos.skuLines.reduce((sum, s) => sum + s.expectedQuantity, 0);
                const isChecked = checked.has(pos.id);
                const flags = FLAG_CHIPS.filter(
                  (f) => (pos.instruction as Record<string, unknown>)[f.key] === true,
                );
                const i = pos.instruction;
                // Nur bei „Etikett mit Preis" steht ein Preis auf dem Etikett, der
                // gegen den VK-Etikett-Preis zu prüfen wäre.
                const checksPrintedPrice = printedPriceCheckRequired(i.labelPrintVariant);
                const manualProblems = manualByPosition.get(pos.id) ?? [];
                // Punkt 9 (generisch): ein Problem OHNE gewählte Größe („Ganze
                // Position") markiert die gesamte Position rot — Kopfzeile und
                // alle Größenzeilen.
                const positionWideProblem = manualProblems.some((x) => x.skuLineId === undefined);
                // Positions-Kontext als horizontale Meta-Zeile unter dem Artikeltitel
                // (Nachtrag 15.07.2026): HS · Shop · Etage · Filiale · Bereich, CatMan als Chip.
                const metaText = [
                  pos.hShopNo ? `HS ${pos.hShopNo}` : null,
                  `Shop ${pos.shopNo}`,
                  pos.floor ? `Etage ${pos.floor}` : null,
                  pos.branchNo ? `Filiale ${pos.branchNo}` : null,
                  c.primaryShopAreaNo ? `Bereich ${c.primaryShopAreaNo}` : null,
                ]
                  .filter((part): part is string => part !== null)
                  .join(' · ');
                // Preisetikett + Sicherung stehen als Piktogramm-Karten (unten);
                // hier bleiben nur die textlichen Zusatz-Hinweise.
                const instructionLines = [
                  i.onlineHandlingRequired && i.onlineHandlingLocation
                    ? `Online: ${i.onlineHandlingLocation}`
                    : null,
                  i.notes ? `Hinweis: ${i.notes}` : null,
                ].filter((line): line is string => line !== null);
                return (
                  <TableBody key={pos.id}>
                    <TableRow
                      sx={positionWideProblem ? PROBLEM_ROW_SX : { bgcolor: 'action.hover' }}
                    >
                      <TableCell sx={{ verticalAlign: 'top' }}>
                        <Typography sx={{ fontWeight: 800, fontSize: '1.25rem', lineHeight: 1.15 }}>
                          Pos {pos.positionNo}
                        </Typography>
                      </TableCell>
                      <TableCell colSpan={columns.length - 1} sx={{ verticalAlign: 'top' }}>
                        <Stack
                          direction="row"
                          spacing={2}
                          justifyContent="space-between"
                          alignItems="flex-start"
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Stack
                              direction="row"
                              alignItems="center"
                              sx={{ flexWrap: 'wrap', gap: 0.75 }}
                            >
                              {/* D3: Artikel-Nr. + Farbe in derselben Schriftgröße. */}
                              <Typography sx={{ fontWeight: 700 }}>
                                {pos.supplierArticleNo} · {pos.supplierColor}
                              </Typography>
                              {pos.nosFlag ? (
                                <Chip
                                  size="small"
                                  color="success"
                                  icon={<AutorenewOutlinedIcon />}
                                  label="NOS"
                                />
                              ) : null}
                              {!pos.nosFlag && positionWarenart(pos) ? (
                                <Chip
                                  size="small"
                                  color="secondary"
                                  variant="outlined"
                                  label={positionWarenart(pos)}
                                />
                              ) : null}
                              {/* Etikett-Druckvariante DIESER Position — steht vor den
                                  übrigen Anweisungs-Chips, weil sie den Druckauftrag steuert. */}
                              <LabelPrintVariantChip variant={i.labelPrintVariant} />
                              {flags.map((f) => (
                                <Chip
                                  key={f.key}
                                  size="small"
                                  color={f.color}
                                  icon={<f.Icon />}
                                  label={f.label}
                                />
                              ))}
                            </Stack>

                            {/* Warenbezeichnung: WGR mit Klartext (+ Saison). */}
                            <Typography variant="body2" color="text.secondary">
                              WGR {pos.wgr}
                              {WGR_DESCRIPTION.get(pos.wgr)
                                ? ` ${WGR_DESCRIPTION.get(pos.wgr)}`
                                : ''}
                              {pos.season ? ` · Saison ${pos.season}` : ''}
                            </Typography>

                            {/* Nachtrag 15.07.2026: Positions-Kontext als horizontale
                                Meta-Zeile — HS · Shop · Etage · Filiale · Bereich, CatMan als Chip. */}
                            <Stack
                              direction="row"
                              alignItems="center"
                              sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.75 }}
                            >
                              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                {metaText}
                              </Typography>
                              {/* CatMan-Chip nur mit echtem Termin-Datum — ein bloßes
                                  Kennzeichen ohne Datum wäre nur Rauschen (Nachtrag
                                  15.07.2026). Überschritten ⇒ rot „überfällig". */}
                              <CatManChip date={pos.catManDate} referenceDay={referenceDay} />
                            </Stack>

                            {/* Arbeitsschritt-Piktogramme (AW-Bildsprache): Preisetikett
                                anbringen + Sichern, groß und wiedererkennbar. */}
                            {labelPrintRequired(i.labelPrintVariant) ||
                            (i.securityRequired && i.securityTypeCode) ? (
                              <Stack direction="row" sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
                                {labelPrintRequired(i.labelPrintVariant) ? (
                                  <WorkStepPictogram
                                    code={ETIKETT_PICTOGRAM_CODE}
                                    title={
                                      printedPriceCheckRequired(i.labelPrintVariant)
                                        ? 'Preisetikett anbringen'
                                        : 'Etikett ohne Preis anbringen'
                                    }
                                    subtitle={i.priceLabelAttachLocation ?? undefined}
                                  />
                                ) : null}
                                {i.securityRequired && i.securityTypeCode ? (
                                  <WorkStepPictogram
                                    code={i.securityTypeCode}
                                    title={`Sichern: ${PICTOGRAM_LABEL[i.securityTypeCode] ?? i.securityTypeCode}`}
                                    subtitle={i.securityLocation ?? undefined}
                                  />
                                ) : null}
                              </Stack>
                            ) : null}

                            {instructionLines.length > 0 ? (
                              <Stack
                                direction="row"
                                sx={{ mt: 0.5, flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}
                              >
                                {instructionLines.map((line) => (
                                  <Typography key={line} variant="body2" color="text.secondary">
                                    {line}
                                  </Typography>
                                ))}
                              </Stack>
                            ) : null}

                            {/* Punkt 9: farbliche Markierung der erfassten manuellen Probleme. */}
                            {manualProblems.length > 0 ? (
                              <Stack direction="row" sx={{ mt: 0.75, flexWrap: 'wrap', gap: 0.5 }}>
                                {manualProblems.map((problem) => (
                                  <Chip
                                    key={problem.id}
                                    size="small"
                                    color="error"
                                    variant="filled"
                                    label={
                                      problem.note
                                        ? `${problem.reasonLabel}: ${problem.note}`
                                        : problem.reasonLabel
                                    }
                                    onDelete={() => flow.removeProblem(problem.id)}
                                  />
                                ))}
                              </Stack>
                            ) : null}
                          </Box>

                          <Stack
                            direction="row"
                            spacing={1}
                            alignItems="center"
                            sx={{ flexShrink: 0 }}
                          >
                            <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                              Soll gesamt {soll}
                            </Typography>
                            {/* Nur-Ansicht: keine Prüf-/Problem-Aktionen an fertigen Belegen. */}
                            {!readOnly ? (
                              <>
                                {isChecked ? (
                                  <Chip
                                    color="success"
                                    icon={<CheckIcon />}
                                    label="Position geprüft"
                                    onClick={() => void flow.togglePositionChecked(pos.id)}
                                    sx={{ height: TOUCH_TARGET_MIN, fontSize: '1rem', px: 0.5 }}
                                  />
                                ) : (
                                  <Button
                                    variant="contained"
                                    onClick={() => void flow.togglePositionChecked(pos.id)}
                                  >
                                    Position geprüft
                                  </Button>
                                )}
                                <Button
                                  color="error"
                                  variant="text"
                                  onClick={() => setProblemTarget(pos)}
                                >
                                  Problem
                                </Button>
                              </>
                            ) : null}
                          </Stack>
                        </Stack>
                      </TableCell>
                    </TableRow>

                    {pos.skuLines.map((s) => {
                      // Nur-Ansicht zeigt die vom Server verbuchte Ist-Menge (wo
                      // vorhanden) statt des lokalen — dort leeren — Fortschritts.
                      const ist = readOnly
                        ? (s.confirmedQuantity ?? s.expectedQuantity)
                        : (progress.confirmedQuantities[s.id] ?? s.expectedQuantity);
                      const delta = ist - s.expectedQuantity;
                      const mark = aggregate.onlineMarks[s.id];
                      const corrected = progress.correctedVkPrices[s.id];
                      const hasPriceProblem = corrected !== undefined;
                      // Punkt 9: Zeile rot bei Mengenabweichung, Preisproblem
                      // oder gemeldetem Problem — größenspezifisch oder
                      // positionsweit (ohne Größe gemeldet).
                      const skuProblem = manualProblems.some((x) => x.skuLineId === s.id);
                      const rowProblem =
                        delta !== 0 || hasPriceProblem || skuProblem || positionWideProblem;
                      return (
                        <TableRow key={s.id} hover sx={rowProblem ? PROBLEM_ROW_SX : undefined}>
                          <TableCell />
                          <TableCell sx={NUMERIC_CELL}>{s.ean}</TableCell>
                          <TableCell sx={{ fontWeight: 700 }}>{s.size}</TableCell>
                          {hasOnlineMarks ? (
                            <TableCell sx={{ whiteSpace: 'nowrap' }}>
                              {mark ? (
                                <Chip
                                  size="small"
                                  color={ONLINE_MARK[mark].color}
                                  label={ONLINE_MARK[mark].label}
                                  sx={{
                                    maxWidth: 'none',
                                    '& .MuiChip-label': { overflow: 'visible' },
                                  }}
                                />
                              ) : null}
                            </TableCell>
                          ) : null}
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {s.expectedQuantity}
                          </TableCell>
                          <TableCell align="center">
                            <Stack
                              direction="row"
                              spacing={0.5}
                              alignItems="center"
                              justifyContent="center"
                            >
                              {!readOnly ? (
                                <IconButton
                                  sx={STEPPER_BUTTON}
                                  aria-label={`Größe ${s.size}: Menge verringern`}
                                  onClick={() =>
                                    void flow.setSkuQuantity(s.id, ist - 1, s.expectedQuantity)
                                  }
                                >
                                  −
                                </IconButton>
                              ) : null}
                              <Typography
                                sx={{
                                  ...NUMERIC_CELL,
                                  minWidth: 36,
                                  fontWeight: 700,
                                  fontSize: '1.0625rem',
                                  color: delta !== 0 ? 'error.main' : 'text.primary',
                                }}
                              >
                                {ist}
                              </Typography>
                              {!readOnly ? (
                                <IconButton
                                  sx={STEPPER_BUTTON}
                                  aria-label={`Größe ${s.size}: Menge erhöhen`}
                                  onClick={() =>
                                    void flow.setSkuQuantity(s.id, ist + 1, s.expectedQuantity)
                                  }
                                >
                                  +
                                </IconButton>
                              ) : null}
                            </Stack>
                          </TableCell>
                          <TableCell>
                            {delta !== 0 ? (
                              <Chip
                                size="small"
                                color="warning"
                                label={
                                  delta > 0
                                    ? `+${delta} Mehrmenge`
                                    : `−${Math.abs(delta)} Mindermenge`
                                }
                              />
                            ) : null}
                          </TableCell>
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {price(s.ekPrice) ?? '—'}
                          </TableCell>
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {price(s.vkPrice) ?? '—'}
                          </TableCell>
                          <TableCell align="right" sx={NUMERIC_CELL}>
                            {price(s.vkLabelPrice) ?? '—'}
                          </TableCell>
                          {/* Punkt 4: Etikettpreis-Eingabe direkt hinter der VK-Etikett-Spalte
                              — nur dort, wo überhaupt ein Preis aufs Etikett gedruckt wird
                              (Kundenfeedback 03.08.2026). Bei DigiTag-/Ohne-Etikett-Positionen
                              gibt es keinen aufgedruckten Preis zu prüfen. */}
                          {hasPrintedPrices ? (
                            <TableCell
                              align="right"
                              sx={readOnly || !checksPrintedPrice ? NUMERIC_CELL : undefined}
                            >
                              {!checksPrintedPrice || readOnly ? (
                                '—'
                              ) : (
                                <EtikettpreisInput
                                  sizeLabel={s.size}
                                  corrected={corrected}
                                  onChange={(value) =>
                                    flow.setCorrectedVkPrice(s.id, value, s.vkLabelPrice)
                                  }
                                />
                              )}
                            </TableCell>
                          ) : null}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                );
              })}
            </Table>
          </TableContainer>
        </Paper>

        {/* Why the close is blocked, if it is. */}
        {!readOnly && !gate.ok ? (
          <Alert severity="info">
            {gate.reasons.join(' · ')}
            {problemCount > 0
              ? ' – über „Teilabschluss (Problem melden)" an die Teamleitung senden.'
              : ''}
          </Alert>
        ) : null}

        {/* Die Meldung aus persist.ts ist bereits ein vollständiger deutscher
            Satz (inkl. etwaigem Retry-Hinweis) — kein Suffix mehr anhängen. */}
        {flow.actionError ? (
          <Alert severity="error" onClose={flow.clearActionError}>
            {flow.actionError}
          </Alert>
        ) : null}
      </Stack>

      <ProblemDialog
        open={problemTarget !== null}
        position={problemTarget}
        onClose={() => setProblemTarget(null)}
        onSave={(problem) => flow.addProblem(problem)}
      />

      <TeilabschlussDialog
        open={partialOpen}
        progress={progress}
        aggregate={aggregate}
        onClose={() => setPartialOpen(false)}
        onConfirm={confirmPartial}
      />
    </StepScaffold>
  );
}

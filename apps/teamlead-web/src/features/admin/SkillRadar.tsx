/**
 * Skill-Radar eines Mitarbeiters (Kundenfeedback 07.08.2026) — reine ANZEIGE.
 *
 * Ersetzt in der Mitarbeiter-Ansicht die frühere Bereich/Skill-Auswahl: „Es gibt
 * keine Mitarbeiter, die nur z. B. HW bearbeiten. Jeder MA macht alles." Statt einer
 * Einstellung zeigt die Ansicht jetzt ein Können-Profil über sechs Achsen (Skala 0–5).
 *
 * VORSCHAU-STAND: die Werte sind PLATZHALTER. Sie werden deterministisch aus der
 * Personalnummer abgeleitet, damit dieselbe Person immer dasselbe Profil zeigt (kein
 * Flackern bei jedem Render, kein Zufall pro Reload) — sie sagen aber noch NICHTS über
 * die tatsächliche Leistung aus. Sobald die Auswertung steht, kommen sie aus echten
 * Arbeitsdaten (ZST-Durchsatz, Problemquote) vom Backend; dann fällt nur die
 * {@link placeholderProfile}-Funktion weg, die Darstellung bleibt.
 *
 * Gezeichnet als eigenes SVG-Polygon — bewusst ohne Chart-Bibliothek: ein Netz aus
 * sechs Achsen ist ein paar Zeilen Trigonometrie, dafür lohnt keine Abhängigkeit.
 */
import type { JSX } from 'react';
import { useTheme } from '@mui/material/styles';
import Box from '@mui/material/Box';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

/** Höchstwert der Skala — 0–5, wie im Kundenfeedback vorgegeben. */
const MAX_VALUE = 5;

/** Eine Achse des Netzes: Kurzform fürs Diagramm, Langform für Legende/Vorlesehilfe. */
export interface SkillRadarAxis {
  key: string;
  /** Beschriftung am Diagramm — kurz, sonst überlappen sich die Ecken. */
  shortLabel: string;
  /** Ausgeschriebene Bedeutung (Legende + aria-label). */
  label: string;
}

export const SKILL_RADAR_AXES: readonly SkillRadarAxis[] = [
  { key: 'tempo', shortLabel: 'Tempo', label: 'Tempo (Teile/Min)' },
  { key: 'sorgfalt', shortLabel: 'Sorgfalt', label: 'Sorgfalt (wenig Probleme/Nacharbeit)' },
  { key: 'haengeware', shortLabel: 'Hängeware', label: 'Hängeware' },
  { key: 'boxen', shortLabel: 'Boxen', label: 'Boxen/Liegeware' },
  { key: 'etiketten', shortLabel: 'Etiketten', label: 'Etiketten & Sicherung' },
  { key: 'vielseitigkeit', shortLabel: 'Vielseitig', label: 'Vielseitigkeit' },
];

/** FNV-1a: kleiner, stabiler String-Hash — gleiche Eingabe, immer gleiche Zahl. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Platzhalter-Profil: je Achse ein fester Wert zwischen 1,5 und 5,0 (halbe Schritte),
 * abgeleitet aus Personalnummer + Achsen-Schlüssel. Deterministisch, damit das Bild
 * einer Person über Reloads und Geräte hinweg identisch bleibt.
 */
export function placeholderProfile(employeeNo: string): Record<string, number> {
  const profile: Record<string, number> = {};
  for (const axis of SKILL_RADAR_AXES) {
    profile[axis.key] = 1.5 + (hash32(`${employeeNo}:${axis.key}`) % 8) * 0.5;
  }
  return profile;
}

/**
 * Zeichenfläche: bewusst BREITER als hoch. Das Netz selbst ist rund, aber die
 * Achsen-Beschriftungen stehen links und rechts daneben — in einem quadratischen
 * viewBox würden sie an der Kante abgeschnitten.
 */
const VIEW_W = 300;
const VIEW_H = 210;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const RADIUS = 66;
const LABEL_RADIUS = RADIUS + 18;

/** Punkt auf der Achse `index` im Abstand `ratio` (0–1) vom Mittelpunkt. */
function point(index: number, ratio: number): { x: number; y: number } {
  const angle = axisAngle(index);
  return {
    x: CX + Math.cos(angle) * RADIUS * ratio,
    y: CY + Math.sin(angle) * RADIUS * ratio,
  };
}

/** Winkel der Achse im Bogenmaß — Achse 0 zeigt nach oben, dann im Uhrzeigersinn. */
function axisAngle(index: number): number {
  return (-90 + (360 / SKILL_RADAR_AXES.length) * index) * (Math.PI / 180);
}

function polygonPoints(ratios: readonly number[]): string {
  return ratios
    .map((ratio, i) => {
      const p = point(i, ratio);
      return `${p.x},${p.y}`;
    })
    .join(' ');
}

export interface SkillRadarProps {
  /** Personalnummer — die Wurzel der deterministischen Platzhalter-Werte. */
  employeeNo: string;
}

export function SkillRadar({ employeeNo }: SkillRadarProps): JSX.Element {
  const theme = useTheme();
  const profile = placeholderProfile(employeeNo);
  const values = SKILL_RADAR_AXES.map((a) => profile[a.key] ?? 0);
  const ratios = values.map((v) => v / MAX_VALUE);
  // Ringe von innen nach außen: 1 … 5 — die Skala bleibt ohne Zahlenachse ablesbar.
  const rings = Array.from({ length: MAX_VALUE }, (_, i) => (i + 1) / MAX_VALUE);

  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="flex-start">
      <Box
        component="svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={`Skill-Radar (Vorschau, Skala 0–5): ${SKILL_RADAR_AXES.map(
          (a, i) => `${a.label} ${values[i]?.toFixed(1)}`,
        ).join(', ')}`}
        sx={{ width: VIEW_W, maxWidth: '100%', height: 'auto', flexShrink: 0 }}
      >
        {rings.map((ring) => (
          <polygon
            key={ring}
            points={polygonPoints(SKILL_RADAR_AXES.map(() => ring))}
            fill="none"
            stroke={theme.palette.divider}
            strokeWidth={1}
          />
        ))}
        {SKILL_RADAR_AXES.map((axis, i) => {
          const outer = point(i, 1);
          return (
            <line
              key={axis.key}
              x1={CX}
              y1={CY}
              x2={outer.x}
              y2={outer.y}
              stroke={theme.palette.divider}
              strokeWidth={1}
            />
          );
        })}
        <polygon
          points={polygonPoints(ratios)}
          fill={theme.palette.primary.main}
          fillOpacity={0.22}
          stroke={theme.palette.primary.main}
          strokeWidth={2}
        />
        {SKILL_RADAR_AXES.map((axis, i) => {
          const p = point(i, ratios[i] ?? 0);
          return <circle key={axis.key} cx={p.x} cy={p.y} r={2.5} fill={theme.palette.primary.main} />;
        })}
        {SKILL_RADAR_AXES.map((axis, i) => {
          const angle = axisAngle(i);
          const cos = Math.cos(angle);
          return (
            <text
              key={axis.key}
              x={CX + cos * LABEL_RADIUS}
              y={CY + Math.sin(angle) * LABEL_RADIUS}
              textAnchor={cos > 0.1 ? 'start' : cos < -0.1 ? 'end' : 'middle'}
              dominantBaseline="middle"
              fontSize={9}
              fill={theme.palette.text.secondary}
            >
              {axis.shortLabel}
            </text>
          );
        })}
      </Box>
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        {SKILL_RADAR_AXES.map((axis, i) => (
          <Typography key={axis.key} variant="caption" color="text.secondary">
            <Box component="span" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {values[i]?.toFixed(1)}
            </Box>{' '}
            · {axis.label}
          </Typography>
        ))}
      </Stack>
    </Stack>
  );
}

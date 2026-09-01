/**
 * „Team-Ansicht" — die rechte Hälfte des geteilten Beleg-Bildschirms
 * (Beleg-Zusammenarbeit 31.08.2026, Konzept §3.6).
 *
 * Links arbeitet man normal an der eigenen Positionstabelle weiter, rechts steht,
 * wie weit die ANDEREN Beteiligten sind:
 *
 * - genau eine andere Person → direkt ihre Einzelansicht (Name, Stand,
 *   Fortschrittsbalken, die von ihr geprüften Positionsnummern);
 * - mehrere → ein Raster aus Kästchen (Initialen, Name, Balken); ein Tipp öffnet
 *   die Einzelansicht, `'Zurück zur Übersicht'` führt zum Raster.
 *
 * Hakt jemand gerade etwas ab, leuchtet SEIN Kästchen kurz auf (`useTeamGlow`,
 * ~1,5 s) — so sieht man, wo gerade gearbeitet wird, ohne nachzufragen. Alle
 * Zahlen kommen fertig vom Backend (`collaboration`), hier wird nur angezeigt.
 */
import { useState, type JSX } from 'react';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import ButtonBase from '@mui/material/ButtonBase';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha } from '@mui/material/styles';
import { ltColors, touchTarget } from '@paket/ui';
import type { CaseAggregate, CaseParticipant } from '../domain/types.js';
import {
  checkedPositionNos,
  isPositionChecked,
  otherActiveParticipants,
  teileFortschritt,
} from '../workflow/workflowModel.js';
import { GLOW_DURATION_MS } from '../data/useTeamGlow.js';
import { initials } from './ProfileMenu.js';

/** Stand eines Beteiligten als Chip-Text; `teil_erledigt` erscheint grau. */
export function participantStatus(participant: CaseParticipant): {
  label: string;
  erledigt: boolean;
} {
  if (participant.status === 'teil_erledigt') return { label: 'Teil erledigt', erledigt: true };
  if (participant.role === 'inhaber') return { label: 'Inhaber', erledigt: false };
  return { label: 'hilft', erledigt: false };
}

/**
 * Aufleuchten (~1,5 s): goldener Ring, der nach außen ausläuft — dieselbe Farbe,
 * mit der auch die Karte eines geteilten Belegs markiert ist (`ltColors.shared`).
 */
const glowSx = {
  animation: `teamGlow ${GLOW_DURATION_MS}ms ease-out`,
  '@keyframes teamGlow': {
    '0%': { boxShadow: `0 0 0 0 ${alpha(ltColors.shared, 0.85)}` },
    '100%': { boxShadow: `0 0 0 14px ${alpha(ltColors.shared, 0)}` },
  },
} as const;

function ProgressBar({ geprueft, gesamt }: { geprueft: number; gesamt: number }): JSX.Element {
  const value = gesamt > 0 ? Math.min(100, (geprueft / gesamt) * 100) : 0;
  return (
    <Box sx={{ width: '100%' }}>
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={`${geprueft} von ${gesamt} Positionen geprüft`}
        sx={{ height: 8, borderRadius: 4 }}
      />
      <Typography variant="caption" color="text.secondary">
        {geprueft}/{gesamt} Positionen geprüft
      </Typography>
    </Box>
  );
}

/**
 * Gesamt-Leiste über der Beteiligten-Liste (Kundenwunsch 01.09.2026): wie weit
 * ist der BELEG — nicht eine einzelne Person. Die Kästchen darunter zeigen je
 * Beteiligtem geprüfte Positionen; wie viel Arbeit davon erledigt ist, sagt erst
 * die Stückzahl, deshalb führt hier die TEILE-Zahl und die Positionen stehen
 * als Zusatz daneben. Gezählt wird über ALLE Beteiligten, mich eingeschlossen.
 */
function GesamtFortschritt({ aggregate }: { aggregate: CaseAggregate }): JSX.Element {
  const teile = teileFortschritt(aggregate);
  const positionen = aggregate.collaboration?.positionCount ?? aggregate.positions.length;
  const geprueft =
    aggregate.collaboration?.confirmedPositionCount ??
    aggregate.positions.filter(isPositionChecked).length;
  const value = teile.gesamt > 0 ? Math.min(100, (teile.erledigt / teile.gesamt) * 100) : 0;
  return (
    <Paper
      variant="outlined"
      data-testid="team-gesamt"
      sx={{ p: 1.5, borderLeft: `4px solid ${ltColors.shared}` }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="baseline">
        <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
          Gesamtfortschritt
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {Math.round(value)} %
        </Typography>
      </Stack>
      <LinearProgress
        variant="determinate"
        value={value}
        aria-label={`${teile.erledigt} von ${teile.gesamt} Teilen abgearbeitet`}
        sx={{
          my: 0.5,
          height: 10,
          borderRadius: 5,
          '& .MuiLinearProgress-bar': { bgcolor: ltColors.shared },
        }}
      />
      <Typography variant="caption" color="text.secondary">
        {teile.erledigt}/{teile.gesamt} Teile · {geprueft}/{positionen} Positionen – alle
        Beteiligten zusammen
      </Typography>
    </Paper>
  );
}

interface ParticipantDetailProps {
  participant: CaseParticipant;
  aggregate: CaseAggregate;
  gesamt: number;
  glowing: boolean;
  onBack?: () => void;
}

/** Einzelansicht: Name, Stand, Balken und die geprüften Positionsnummern. */
function ParticipantDetail({
  participant,
  aggregate,
  gesamt,
  glowing,
  onBack,
}: ParticipantDetailProps): JSX.Element {
  const status = participantStatus(participant);
  const positionNos = checkedPositionNos(aggregate, participant.employeeNo);
  return (
    <Stack spacing={1.5}>
      {onBack ? (
        <Button size="small" onClick={onBack} sx={{ alignSelf: 'flex-start', ml: -1 }}>
          ‹ Zurück zur Übersicht
        </Button>
      ) : null}
      <Paper
        variant="outlined"
        data-glow={glowing ? 'true' : undefined}
        sx={{
          p: 2,
          ...(glowing ? glowSx : {}),
          ...(status.erledigt ? { bgcolor: 'grey.100' } : {}),
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Avatar
            sx={{
              bgcolor: status.erledigt ? 'grey.500' : ltColors.shared,
              fontWeight: 700,
              width: 44,
              height: 44,
            }}
          >
            {initials(participant.displayName)}
          </Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700 }}>{participant.displayName}</Typography>
            <Chip
              size="small"
              label={status.label}
              sx={status.erledigt ? { bgcolor: 'grey.300', color: 'text.secondary' } : undefined}
            />
          </Box>
        </Stack>
        <Box sx={{ mt: 1.5 }}>
          <ProgressBar geprueft={participant.confirmedPositionCount} gesamt={gesamt} />
        </Box>
        <Typography variant="subtitle2" sx={{ mt: 1.5 }}>
          Geprüfte Positionen
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {positionNos.length > 0
            ? positionNos.map((no) => `Pos ${no}`).join(' · ')
            : 'Noch keine Position geprüft'}
        </Typography>
      </Paper>
    </Stack>
  );
}

export interface TeamPaneProps {
  aggregate: CaseAggregate;
  /** Eigene Mitarbeiternummer — man selbst steht nicht im Team-Raster. */
  meineEmployeeNo: string | undefined;
  /** employeeNos, deren Kästchen gerade aufleuchten (`useTeamGlow`). */
  glow: ReadonlySet<string>;
}

export function TeamPane({ aggregate, meineEmployeeNo, glow }: TeamPaneProps): JSX.Element | null {
  const [selectedEmployeeNo, setSelectedEmployeeNo] = useState<string | null>(null);
  const others = otherActiveParticipants(aggregate, meineEmployeeNo);
  const gesamt = aggregate.collaboration?.positionCount ?? aggregate.positions.length;
  // Ohne andere Beteiligte gibt es nichts zu zeigen — den Umschalter bietet der
  // Bildschirm dann ohnehin nicht an.
  if (others.length === 0) return null;

  const single = others.length === 1 ? others[0] : undefined;
  const selected = single ?? others.find((p) => p.employeeNo === selectedEmployeeNo);

  return (
    <Stack spacing={1.5} data-testid="team-pane">
      <GesamtFortschritt aggregate={aggregate} />
      <Typography variant="subtitle2">Beteiligte</Typography>
      {selected ? (
        <ParticipantDetail
          participant={selected}
          aggregate={aggregate}
          gesamt={gesamt}
          glowing={glow.has(selected.employeeNo)}
          onBack={single ? undefined : () => setSelectedEmployeeNo(null)}
        />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))',
            gap: 1,
          }}
        >
          {others.map((participant) => {
            const status = participantStatus(participant);
            return (
              <ButtonBase
                key={participant.participantId}
                onClick={() => setSelectedEmployeeNo(participant.employeeNo)}
                aria-label={`${participant.displayName} – Fortschritt anzeigen`}
                // Für Tests/Assistenztechnik sichtbar gemacht: das Kästchen leuchtet gerade.
                data-glow={glow.has(participant.employeeNo) ? 'true' : undefined}
                sx={{
                  display: 'block',
                  textAlign: 'left',
                  p: 1.25,
                  minHeight: touchTarget.min,
                  borderRadius: 2,
                  border: '1px solid',
                  borderColor: 'divider',
                  bgcolor: status.erledigt ? 'grey.100' : 'background.paper',
                  ...(glow.has(participant.employeeNo) ? glowSx : {}),
                }}
              >
                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.75 }}>
                  <Avatar
                    sx={{
                      bgcolor: status.erledigt ? 'grey.500' : ltColors.shared,
                      fontWeight: 700,
                      width: 32,
                      height: 32,
                      fontSize: '0.8rem',
                    }}
                  >
                    {initials(participant.displayName)}
                  </Avatar>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography
                      variant="body2"
                      sx={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {participant.displayName}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {status.label}
                    </Typography>
                  </Box>
                </Stack>
                <ProgressBar geprueft={participant.confirmedPositionCount} gesamt={gesamt} />
              </ButtonBase>
            );
          })}
        </Box>
      )}
    </Stack>
  );
}

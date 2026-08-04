/**
 * Zähler-Badge der Beleg-Karte unter „2 · Bearbeiten" (Kundenfeedback
 * 04.08.2026): „1x", „2x", … = Anzahl der Meldungen dieses Belegs — ersetzt das
 * frühere Problem-Symbol ganz links. Farb-Logik: alle offen = rot, alle
 * instruiert = grün, teils/teils = zweigeteilt (halb grün / halb rot).
 * Tap (Handy) bzw. Hover (Desktop) öffnet ein Popover mit ALLEN Meldungen:
 * Art, Position, Einzel-Status — instruierte grün mit Instruktionstext,
 * offene rot. Reine Anzeige; jede Statuswahrheit kommt vom Backend.
 */
import { useRef, useState, type JSX } from 'react';
import Box from '@mui/material/Box';
import Popover from '@mui/material/Popover';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { Theme } from '@mui/material/styles';
import { problemKindLabels } from '@paket/ui';
import type { components } from '@paket/api-client';

type IssueSummaryDto = components['schemas']['IssueSummaryDto'];

/** Badge-Hintergrund je Meldungslage: rot / grün / zweigeteilt. */
function badgeBackground(openCount: number, total: number): object {
  if (openCount === total) return { bgcolor: 'error.main' };
  if (openCount === 0) return { bgcolor: 'success.main' };
  return {
    background: (theme: Theme) =>
      `linear-gradient(90deg, ${theme.palette.success.main} 50%, ${theme.palette.error.main} 50%)`,
  };
}

export function issueDisplayLabel(issue: Pick<IssueSummaryDto, 'kind' | 'reasonLabel'>): string {
  return (
    issue.reasonLabel ??
    problemKindLabels[issue.kind as keyof typeof problemKindLabels] ??
    issue.kind
  );
}

export function IssueBadge({ issues }: { issues: IssueSummaryDto[] }): JSX.Element {
  const anchor = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const openCount = issues.filter((i) => i.status === 'open').length;

  return (
    <>
      <Box
        ref={anchor}
        onClick={(e) => {
          // Die Karte selbst öffnet den Beleg — der Badge-Tap nur das Popover.
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        aria-label={`${issues.length} Meldungen, ${openCount} offen`}
        sx={{
          width: 40,
          height: 40,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 800,
          fontSize: '0.95rem',
          flexShrink: 0,
          userSelect: 'none',
          ...badgeBackground(openCount, issues.length),
        }}
      >
        {issues.length}x
      </Box>
      <Popover
        open={open}
        anchorEl={anchor.current}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        disableRestoreFocus
        sx={{ pointerEvents: 'none' }}
        slotProps={{ paper: { sx: { pointerEvents: 'auto', p: 1.5, maxWidth: 340 } } }}
      >
        <Stack spacing={1}>
          {issues.map((issue) => {
            const offen = issue.status === 'open';
            return (
              <Box
                key={issue.id}
                sx={{
                  pl: 1,
                  borderLeft: 3,
                  borderColor: offen ? 'error.main' : 'success.main',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {issueDisplayLabel(issue)}
                  {issue.positionNo != null ? ` · Pos. ${issue.positionNo}` : ''}
                </Typography>
                <Typography
                  variant="caption"
                  sx={{ fontWeight: 700 }}
                  color={offen ? 'error.main' : 'success.main'}
                >
                  {offen ? 'Offen — wartet auf die Teamleitung' : 'Instruktion erhalten'}
                </Typography>
                {!offen && issue.instruction ? (
                  <Typography variant="body2" color="success.main">
                    „{issue.instruction}"
                  </Typography>
                ) : null}
              </Box>
            );
          })}
        </Stack>
      </Popover>
    </>
  );
}

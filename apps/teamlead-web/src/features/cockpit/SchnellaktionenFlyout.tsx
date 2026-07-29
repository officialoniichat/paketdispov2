/**
 * Trapez-Ausklapper an der Außenkante der Sidebar (vertikale Mitte): ein
 * Trapez-Knopf (linke Kante volle Höhe, rechts eine durchgehend senkrechte
 * Front auf Höhe des früheren Hexagon-„Hügels", oben/unten je EINE gerade
 * Schräge), der eine ZWEITE Sidebar mit den Schnellaktionen des Tagescockpits
 * ausklappt. Default weiß, rot sobald Meldungen vorliegen — Knopf und Panel
 * voll deckend; das blaue gleichschenklige Dreieck zeigt nach rechts
 * (geöffnet nach links). Geöffnet liegt das Popout über ALLEM: onOpenChange
 * meldet den Zustand an die AppShell, die den Stacking-Context der Rail über
 * alle Ebenen hebt (die Rail selbst ist sticky — ein z-Index hier drin allein
 * könnte den Seiteninhalt nie unterbieten lassen).
 */
import { useState, type JSX } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import CloseIcon from '@mui/icons-material/Close';
import { ltColors } from '@paket/ui';
import { SchnellaktionenListe, useSchnellaktionen } from './schnellaktionen.js';

const HEX_W = 26;
const HEX_H = 84;
const PANEL_W = 340;

export interface SchnellaktionenFlyoutProps {
  /** Meldet Auf-/Zuklappen — die AppShell hebt die Rail dann über alle Ebenen. */
  onOpenChange?: (open: boolean) => void;
}

export function SchnellaktionenFlyout({ onOpenChange }: SchnellaktionenFlyoutProps): JSX.Element {
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean): void => {
    setOpenState(next);
    onOpenChange?.(next);
  };
  const decisions = useSchnellaktionen();
  const alarm = decisions.length > 0;
  const label = open
    ? 'Schnellaktionen einklappen'
    : `Schnellaktionen ausklappen${
        alarm ? ` — ${decisions.length} ${decisions.length === 1 ? 'Meldung' : 'Meldungen'}` : ''
      }`;

  return (
    // Der Rahmen hängt an der Nav-Rail (left: 100 %) und trägt Panel + Knopf —
    // der Trapez-Knopf wandert beim Öffnen mit an die Außenkante des Panels.
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: '100%',
        width: open ? PANEL_W : 0,
        transition: 'width 150ms ease',
        zIndex: (t) => t.zIndex.drawer,
      }}
    >
      {open && (
        <Box
          role="complementary"
          aria-label="Schnellaktionen"
          sx={{
            position: 'absolute',
            inset: 0,
            // Voll deckend (Nutzer-Vorgabe „höchste Deckkraft") — nichts scheint durch.
            bgcolor: '#fff',
            opacity: 1,
            color: 'text.primary',
            borderRight: '1px solid',
            borderColor: 'divider',
            boxShadow: 6,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              px: 2,
              py: 1.25,
              borderBottom: '1px solid',
              borderColor: 'divider',
            }}
          >
            <Typography variant="subtitle1" sx={{ fontWeight: 800, flex: 1 }} noWrap>
              Schnellaktionen{alarm ? ` (${decisions.length})` : ''}
            </Typography>
            <IconButton
              size="small"
              aria-label="Schnellaktionen schließen"
              onClick={() => setOpen(false)}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, minHeight: 0, overflow: 'auto', p: 1.5 }}>
            {decisions.length === 0 ? (
              <Alert severity="success">
                Nichts wartet auf dich — die Automatik hat alles verteilt.
              </Alert>
            ) : (
              <SchnellaktionenListe decisions={decisions} />
            )}
          </Box>
        </Box>
      )}

      <Tooltip title={label} placement="right">
        <Box
          component="button"
          type="button"
          aria-label={label}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          sx={{
            position: 'absolute',
            top: '50%',
            right: -HEX_W,
            transform: 'translateY(-50%)',
            width: HEX_W,
            height: HEX_H,
            border: 'none',
            p: 0,
            m: 0,
            cursor: 'pointer',
            // Trapez (Nutzer-Wunsch): oben und unten je EINE gerade Schräge,
            // rechts eine durchgehend senkrechte Front — in voller Breite, dort
            // wo vorher der Hexagon-„Hügel" saß.
            clipPath: 'polygon(0% 0%, 100% 15%, 100% 85%, 0% 100%)',
            // Default WEISS, rot nur bei Meldungen — immer voll deckend; der
            // Schatten ersetzt den Rand (ein CSS-Border folgt der Clip-Form nicht).
            bgcolor: alarm ? ltColors.danger : '#fff',
            opacity: 1,
            filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))',
            transition: 'background-color 150ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': { filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.4)) brightness(0.94)' },
          }}
        >
          {/* Blaues gleichschenkliges Dreieck: zeigt nach rechts, geöffnet nach links. */}
          <Box
            aria-hidden
            sx={{
              width: 0,
              height: 0,
              borderTop: '7px solid transparent',
              borderBottom: '7px solid transparent',
              ...(open
                ? { borderRight: '9px solid #1976d2', mr: '2px' }
                : { borderLeft: '9px solid #1976d2', ml: '2px' }),
            }}
          />
        </Box>
      </Tooltip>
    </Box>
  );
}

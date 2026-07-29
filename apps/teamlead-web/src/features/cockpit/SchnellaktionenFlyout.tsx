/**
 * Hexagon-Ausklapper an der Außenkante der Sidebar (vertikale Mitte): ein
 * asymmetrischer Sechseck-Knopf nach Nutzer-Skizze (oberste/unterste Kante
 * stark nach innen gezogen, die zweiten flacher, die Mitte perfekt senkrecht),
 * der eine ZWEITE Sidebar mit den Schnellaktionen des Tagescockpits ausklappt.
 * Der Knopf wird rot, sobald Meldungen vorliegen; das blaue gleichschenklige
 * Dreieck zeigt nach rechts (geöffnet nach links).
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

export function SchnellaktionenFlyout(): JSX.Element {
  const [open, setOpen] = useState(false);
  const decisions = useSchnellaktionen();
  const alarm = decisions.length > 0;
  const label = open
    ? 'Schnellaktionen einklappen'
    : `Schnellaktionen ausklappen${
        alarm ? ` — ${decisions.length} ${decisions.length === 1 ? 'Meldung' : 'Meldungen'}` : ''
      }`;

  return (
    // Der Rahmen hängt an der Nav-Rail (left: 100 %) und trägt Panel + Knopf —
    // der Hexagon-Knopf wandert beim Öffnen mit an die Außenkante des Panels.
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
            bgcolor: 'background.paper',
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
          onClick={() => setOpen((o) => !o)}
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
            // Asymmetrisches Hexagon (Nutzer-Skizze): von oben — starke Schräge,
            // flachere Schräge, senkrechte Vorderkante, dann gespiegelt zurück.
            clipPath: 'polygon(0% 0%, 55% 18%, 100% 38%, 100% 62%, 55% 82%, 0% 100%)',
            bgcolor: alarm ? ltColors.danger : ltColors.brand,
            transition: 'background-color 150ms ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            '&:hover': { filter: 'brightness(1.2)' },
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
                ? { borderRight: '9px solid #4da3ff', mr: '2px' }
                : { borderLeft: '9px solid #4da3ff', ml: '2px' }),
            }}
          />
        </Box>
      </Tooltip>
    </Box>
  );
}

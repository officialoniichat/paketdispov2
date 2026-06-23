/**
 * Visual hint for WHERE to attach the price label (Arbeitsanweisung point 8,
 * "Preisetiketten anbringen" — the printed form carries a placement graphic).
 *
 * When the backend provides a real placement asset (`imageUrl`, from
 * `WorkInstructionPoint.assetRef`) it is shown; otherwise an illustrative
 * built-in diagram is rendered so the worker still gets a visual cue. Any
 * `priceLabelAttachLocation` texts are listed underneath.
 */
import type { JSX } from 'react';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

export interface LabelPlacementHintProps {
  /** Distinct attach-location texts from the positions, if any. */
  locations?: string[];
  /** Real placement image (future: from the AW asset); falls back to the diagram. */
  imageUrl?: string;
}

/** Illustrative garment + price-tag diagram (no external asset needed). */
function PlacementDiagram(): JSX.Element {
  return (
    <Box
      component="svg"
      viewBox="0 0 120 96"
      role="img"
      aria-label="Preisetikett am Innenbund anbringen"
      sx={{ width: 132, height: 'auto', display: 'block' }}
    >
      {/* garment (t-shirt) silhouette */}
      <path
        d="M40 12 L52 6 Q60 14 68 6 L80 12 L94 26 L84 36 L78 30 L78 86 Q60 92 42 86 L42 30 L36 36 L26 26 Z"
        fill="currentColor"
        opacity="0.10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      {/* price tag */}
      <g>
        <rect x="50" y="34" width="34" height="20" rx="3" fill="#c8102e" />
        <circle cx="55" cy="40" r="2.4" fill="#fff" />
        <line x1="60" y1="44" x2="80" y2="44" stroke="#fff" strokeWidth="2" />
        <line x1="60" y1="49" x2="74" y2="49" stroke="#fff" strokeWidth="2" />
      </g>
      {/* arrow pointing to the tag */}
      <g stroke="currentColor" strokeWidth="2" fill="none">
        <path d="M104 70 Q96 60 88 48" />
        <path d="M88 48 l6 1 M88 48 l1 6" strokeLinecap="round" />
      </g>
    </Box>
  );
}

export function LabelPlacementHint({
  locations = [],
  imageUrl,
}: LabelPlacementHintProps): JSX.Element {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <Typography variant="subtitle2" gutterBottom>
        Preisetikett – wo anbringen?
      </Typography>
      <Stack direction="row" spacing={2} alignItems="center">
        <Box sx={{ color: 'text.secondary', flexShrink: 0 }}>
          {imageUrl ? (
            <Box
              component="img"
              src={imageUrl}
              alt="Preisetikett anbringen"
              sx={{ width: 132, height: 'auto', display: 'block' }}
            />
          ) : (
            <PlacementDiagram />
          )}
        </Box>
        <Box sx={{ minWidth: 0 }}>
          {locations.length > 0 ? (
            <Stack spacing={0.25}>
              {locations.map((loc) => (
                <Typography key={loc} variant="body2">
                  {loc}
                </Typography>
              ))}
            </Stack>
          ) : (
            <Typography variant="body2" color="text.secondary">
              Etikett gemäß Arbeitsanweisung anbringen.
            </Typography>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}

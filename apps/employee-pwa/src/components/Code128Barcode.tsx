/**
 * Inline Code-128 SVG (Kundenfeedback 2026-07-14, Punkt 3): rendert die reine
 * Balkengeometrie aus `domain/code128.ts` als scanner-taugliches SVG — weißer
 * Grund, 10 Module Ruhezone links/rechts, harte Kanten (kein Anti-Aliasing).
 * Kein Canvas, keine Dependency; die Klarschrift steht darunter.
 */
import type { JSX } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { encodeCode128 } from '../domain/code128.js';

const QUIET_ZONE_MODULES = 10;
const BAR_HEIGHT = 64;

export interface Code128BarcodeProps {
  value: string;
}

export function Code128Barcode({ value }: Code128BarcodeProps): JSX.Element {
  const { widths, totalModules } = encodeCode128(value);
  const viewWidth = totalModules + 2 * QUIET_ZONE_MODULES;

  const bars: JSX.Element[] = [];
  let x = QUIET_ZONE_MODULES;
  widths.forEach((width, index) => {
    // runs alternate bar/space, starting with a bar
    if (index % 2 === 0) {
      bars.push(<rect key={index} x={x} y={0} width={width} height={BAR_HEIGHT} fill="#000" />);
    }
    x += width;
  });

  return (
    <Box sx={{ bgcolor: '#fff', borderRadius: 1, p: 1, textAlign: 'center' }}>
      <svg
        viewBox={`0 0 ${viewWidth} ${BAR_HEIGHT}`}
        width="100%"
        height={BAR_HEIGHT}
        preserveAspectRatio="none"
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Barcode ${value}`}
      >
        <rect x={0} y={0} width={viewWidth} height={BAR_HEIGHT} fill="#fff" />
        {bars}
      </svg>
      <Typography variant="body2" sx={{ color: '#000', letterSpacing: 2 }}>
        {value}
      </Typography>
    </Box>
  );
}

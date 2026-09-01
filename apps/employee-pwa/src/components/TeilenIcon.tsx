import SvgIcon, { type SvgIconProps } from '@mui/material/SvgIcon';
import type { JSX } from 'react';

/**
 * Teilen-Symbol im Apple-Stil (Kundenwunsch 01.09.2026): Kasten mit offener
 * Oberkante und einem Pfeil, der oben herauszeigt. Bewusst als Strichzeichnung
 * statt der gefüllten MUI-Variante — so bleibt der Pfeil auch in der kleinen
 * runden Schaltfläche auf der Beleg-Karte erkennbar.
 */
export function TeilenIcon(props: SvgIconProps): JSX.Element {
  return (
    <SvgIcon
      viewBox="0 0 24 24"
      {...props}
      sx={{
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        ...props.sx,
      }}
    >
      <path d="M12 15V3.6" />
      <path d="M8.4 7.2 12 3.6l3.6 3.6" />
      <path d="M8.2 9.4H6.6A1.6 1.6 0 0 0 5 11v7.9a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6V11a1.6 1.6 0 0 0-1.6-1.6h-1.6" />
    </SvgIcon>
  );
}

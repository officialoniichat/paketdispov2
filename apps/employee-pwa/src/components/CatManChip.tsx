/**
 * Der CatMan-Termin als Chip — EINE Darstellung für alle Fundstellen (Beleg-Karte
 * unter „Ware holen"/„Bearbeiten", Beleg-Kopf und Positionszeile), damit Format
 * und Warnfarbe nirgends auseinanderlaufen. Ohne Termin rendert die Komponente
 * nichts: ein leerer Platzhalter wäre nur Rauschen.
 *
 * Anzeige, keine Steuerung: ein überschrittener Termin wird rot als „überfällig"
 * markiert — er ändert aber weder Reihenfolge noch Freigabe eines Belegs.
 */
import type { JSX } from 'react';
import Chip from '@mui/material/Chip';
import EventOutlinedIcon from '@mui/icons-material/EventOutlined';
import { catManDateLabel, isCatManOverdue } from '../domain/catMan.js';

export interface CatManChipProps {
  /** ISO-Tag des Termins; ohne Termin rendert die Komponente nichts. */
  date: string | null | undefined;
  /** Bezugstag (ISO) des Überfälligkeits-Vergleichs — siehe `useReferenceDay`. */
  referenceDay: string;
  /** `small` in Listen/Positionszeilen, `medium` in der Fakten-Leiste des Beleg-Kopfs. */
  size?: 'small' | 'medium';
}

export function CatManChip({
  date,
  referenceDay,
  size = 'small',
}: CatManChipProps): JSX.Element | null {
  const label = catManDateLabel(date);
  if (!label) return null;
  const overdue = isCatManOverdue(date, referenceDay);
  return (
    <Chip
      size={size}
      // Überfällig sticht als gefüllter roter Chip heraus; ein offener Termin
      // bleibt der bekannte dezente Kontur-Chip aus der Positionszeile.
      variant={overdue ? 'filled' : 'outlined'}
      color={overdue ? 'error' : 'warning'}
      icon={<EventOutlinedIcon />}
      // „CatMan" steht mit im Label: ein nacktes Datum sagt nicht, WAS für ein
      // Termin das ist — daneben stehen Saison, Buchungs- und Lieferdaten.
      label={overdue ? `CatMan ${label} · überfällig` : `CatMan ${label}`}
      aria-label={`CatMan-Termin ${label}${overdue ? ', überfällig' : ''}`}
      sx={{
        fontWeight: overdue ? 700 : 500,
        ...(size === 'small' ? { height: 22, '& .MuiChip-label': { px: 0.75 } } : {}),
      }}
    />
  );
}

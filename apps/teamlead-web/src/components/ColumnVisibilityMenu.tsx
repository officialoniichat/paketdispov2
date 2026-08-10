/**
 * „Spalten"-Menü über einer Tabelle (Kundenfeedback 07.08.2026). Zeigt ALLE
 * ausblendbaren Spalten als Checkbox-Liste — das ist der sichtbare Weg zurück,
 * nachdem eine Spalte über ihr Kopf-Icon ausgeblendet wurde. Ohne diesen Weg wäre
 * das Ausblenden eine Einbahnstraße.
 *
 * Der Zustand gehört dem Aufrufer (er persistiert ihn je Ansicht); hier wird nur
 * angezeigt und umgeschaltet. Die letzte sichtbare Spalte lässt sich nicht auch
 * noch abwählen — eine Tabelle ganz ohne Spalten ist kein sinnvoller Zustand.
 */
import { useState, type JSX } from 'react';
import Badge from '@mui/material/Badge';
import Checkbox from '@mui/material/Checkbox';
import Divider from '@mui/material/Divider';
import IconButton from '@mui/material/IconButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Tooltip from '@mui/material/Tooltip';
import ViewColumnIcon from '@mui/icons-material/ViewColumn';

/** Eine wählbare Spalte: stabile Id + die Beschriftung aus dem Spaltenkopf. */
export interface ColumnOption {
  id: string;
  label: string;
}

export interface ColumnVisibilityMenuProps {
  columns: readonly ColumnOption[];
  /** TanStack-Sichtbarkeit: fehlender Eintrag = sichtbar. */
  visibility: Record<string, boolean>;
  onChange: (visibility: Record<string, boolean>) => void;
}

export function ColumnVisibilityMenu({
  columns,
  visibility,
  onChange,
}: ColumnVisibilityMenuProps): JSX.Element {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const isVisible = (id: string): boolean => visibility[id] !== false;
  const hiddenCount = columns.filter((c) => !isVisible(c.id)).length;
  const visibleCount = columns.length - hiddenCount;

  const toggle = (id: string): void => {
    // Die letzte sichtbare Spalte bleibt stehen.
    if (isVisible(id) && visibleCount <= 1) return;
    onChange({ ...visibility, [id]: !isVisible(id) });
  };

  return (
    <>
      <Tooltip title={hiddenCount > 0 ? `Spalten (${hiddenCount} ausgeblendet)` : 'Spalten'}>
        <IconButton
          size="small"
          aria-label="Spalten ein- und ausblenden"
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          <Badge badgeContent={hiddenCount} color="primary">
            <ViewColumnIcon fontSize="small" />
          </Badge>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={anchor !== null} onClose={() => setAnchor(null)}>
        {columns.map((c) => (
          <MenuItem key={c.id} dense onClick={() => toggle(c.id)}>
            <ListItemIcon>
              <Checkbox
                size="small"
                sx={{ p: 0 }}
                checked={isVisible(c.id)}
                disabled={isVisible(c.id) && visibleCount <= 1}
                inputProps={{ 'aria-label': `Spalte ${c.label}` }}
              />
            </ListItemIcon>
            <ListItemText primary={c.label} />
          </MenuItem>
        ))}
        {hiddenCount > 0 && [
          <Divider key="divider" />,
          <MenuItem key="reset" dense onClick={() => onChange({})}>
            <ListItemText primary="Alle einblenden" />
          </MenuItem>,
        ]}
      </Menu>
    </>
  );
}

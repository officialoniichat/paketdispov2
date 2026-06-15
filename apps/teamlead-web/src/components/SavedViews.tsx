/**
 * Saved-views control for dense tables (Anhang E.6 "gespeicherte Views").
 * Persists the current filter/sort/column snapshot per scope via savedViews.ts.
 */
import { useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import SaveIcon from '@mui/icons-material/Save';
import {
  deleteView,
  listViews,
  saveView,
  type SavedView,
  type SavedViewState,
} from '../data/savedViews.js';

export interface SavedViewsProps {
  scope: string;
  currentState: SavedViewState;
  onApply: (state: SavedViewState) => void;
}

export function SavedViews({ scope, currentState, onApply }: SavedViewsProps): JSX.Element {
  const [views, setViews] = useState<SavedView[]>(() => listViews(scope));
  const [selected, setSelected] = useState('');
  const [newName, setNewName] = useState('');

  function apply(id: string): void {
    setSelected(id);
    const view = views.find((v) => v.id === id);
    if (view) onApply(view.state);
  }

  function handleSave(): void {
    if (!newName.trim()) return;
    setViews(saveView(scope, newName, currentState));
    setNewName('');
  }

  function handleDelete(): void {
    if (!selected) return;
    setViews(deleteView(scope, selected));
    setSelected('');
  }

  return (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <TextField
        select
        size="small"
        label="Gespeicherte View"
        value={selected}
        onChange={(e) => apply(e.target.value)}
        sx={{ minWidth: 180 }}
      >
        <MenuItem value="">
          <em>Keine</em>
        </MenuItem>
        {views.map((v) => (
          <MenuItem key={v.id} value={v.id}>
            {v.name}
          </MenuItem>
        ))}
      </TextField>
      {selected && (
        <IconButton aria-label="View löschen" size="small" onClick={handleDelete}>
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      )}
      <TextField
        size="small"
        label="Neue View"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSave()}
        sx={{ minWidth: 140 }}
      />
      <Button
        size="small"
        variant="outlined"
        startIcon={<SaveIcon />}
        disabled={!newName.trim()}
        onClick={handleSave}
      >
        Speichern
      </Button>
    </Stack>
  );
}

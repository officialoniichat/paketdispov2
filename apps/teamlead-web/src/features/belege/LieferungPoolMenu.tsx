/**
 * Rechtsklick-Menü der Belege-Verwaltung für den Lieferungs-Pool-Hold (D2).
 *
 * Belege einer unvollständigen Lieferung werden zurückgehalten. Wer sie trotzdem
 * verteilen lassen will, gibt sie hier einzeln „In den Pool"; „Zurückhalten" nimmt
 * das wieder zurück. Ein Grund ist optional — die Aktion ist reversibel und wird in
 * jedem Fall auditiert (`case.delivery_group_released` / `…_held`).
 *
 * Die Entscheidung, WER zurückgehalten wird, trifft weiterhin die Engine; dieses
 * Menü setzt nur das Freigabe-Kennzeichen des einzelnen Belegs.
 */
import { useState, type JSX } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { holdDeliveryCases, releaseDeliveryGroup } from '../../data/belege.js';
import type { BelegListRow } from './lieferungZeilen.js';

/** Welche Richtung der Rechtsklick auslöst. */
export type LieferungPoolZiel = 'pool' | 'halten';

const TEXTE: Record<LieferungPoolZiel, { menu: string; titel: string; frage: string; knopf: string }> = {
  pool: {
    menu: 'In den Pool',
    titel: 'Beleg in den Pool geben',
    frage:
      'Der Beleg wird verteilt, obwohl seine Lieferung noch nicht vollständig ist. ' +
      'Die übrigen Belege der Lieferung bleiben zurückgehalten.',
    knopf: 'In den Pool',
  },
  halten: {
    menu: 'Zurückhalten',
    titel: 'Beleg zurückhalten',
    frage:
      'Die Freigabe wird zurückgenommen — der Beleg wartet wieder, bis seine Lieferung ' +
      'vollständig ist.',
    knopf: 'Zurückhalten',
  },
};

/** Position des Rechtsklicks (MUI-Ankerkoordinaten). */
export interface LieferungPoolAnchor {
  mouseX: number;
  mouseY: number;
  row: BelegListRow;
}

export interface LieferungPoolMenuProps {
  anchor: LieferungPoolAnchor | null;
  onClose: () => void;
}

export function LieferungPoolMenu({ anchor, onClose }: LieferungPoolMenuProps): JSX.Element {
  const queryClient = useQueryClient();
  const [ziel, setZiel] = useState<LieferungPoolZiel | null>(null);
  const [grund, setGrund] = useState('');
  const [fehler, setFehler] = useState<string | null>(null);
  const row = anchor?.row ?? null;

  const schliessen = (): void => {
    setZiel(null);
    setGrund('');
    setFehler(null);
    onClose();
  };

  const mutation = useMutation({
    mutationFn: async (input: { caseId: string; ziel: LieferungPoolZiel; grund: string }) => {
      const grundOderUndefined = input.grund.trim() === '' ? undefined : input.grund.trim();
      if (input.ziel === 'pool') await releaseDeliveryGroup([input.caseId], grundOderUndefined);
      else await holdDeliveryCases([input.caseId], grundOderUndefined);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['belege'] });
      void queryClient.invalidateQueries({ queryKey: ['beleg'] });
      void queryClient.invalidateQueries({ queryKey: ['cockpit'] });
      schliessen();
    },
    onError: (e: Error) => setFehler(e.message),
  });

  // Ein Platzhalter (noch nicht gebuchter Beleg) hat keinen Datensatz — für ihn gibt
  // es nichts zu entscheiden. Ebenso wenig für Belege ohne Lieferungs-Lücke.
  const waehlbar: LieferungPoolZiel | null =
    row && !row.ausstehend && row.deliveryGroup && row.deliveryGroup.missingCount > 0
      ? row.deliveryPoolHold
        ? 'pool'
        : 'halten'
      : null;

  const texte = ziel ? TEXTE[ziel] : null;

  return (
    <>
      <Menu
        open={anchor !== null && ziel === null}
        onClose={schliessen}
        anchorReference="anchorPosition"
        anchorPosition={
          anchor ? { top: anchor.mouseY, left: anchor.mouseX } : undefined
        }
      >
        {waehlbar ? (
          <MenuItem onClick={() => setZiel(waehlbar)}>{TEXTE[waehlbar].menu}</MenuItem>
        ) : (
          <MenuItem disabled>
            {row?.ausstehend
              ? 'Beleg ist noch nicht gebucht'
              : 'Lieferung ist vollständig'}
          </MenuItem>
        )}
      </Menu>

      <Dialog open={ziel !== null} onClose={schliessen} maxWidth="xs" fullWidth>
        <DialogTitle>{texte?.titel}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {row?.weBelegNo} · {row?.deliveryGroup?.label}
            <br />
            {texte?.frage}
          </DialogContentText>
          {fehler && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setFehler(null)}>
              {fehler}
            </Alert>
          )}
          <TextField
            fullWidth
            size="small"
            label="Grund (optional)"
            value={grund}
            onChange={(e) => setGrund(e.target.value)}
            autoFocus
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={schliessen} disabled={mutation.isPending}>
            Abbrechen
          </Button>
          <Button
            variant="contained"
            disabled={mutation.isPending || !row || !ziel}
            onClick={() => {
              if (!row || !ziel) return;
              mutation.mutate({ caseId: row.id, ziel, grund });
            }}
          >
            {texte?.knopf}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}

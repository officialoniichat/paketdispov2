/**
 * Kompakte Beleg-Infozeile (Kundenfeedback 07.08.2026): Filiale, Shop, die auf dem
 * Beleg vorkommenden Etikett-Druckvarianten und die Sicherung — als kleine Chips.
 *
 * EIN Bauteil für alle Oberflächen, die diese Angaben zeigen: die Karten der
 * Digitalen Ablage (Original-Reiter UND DA.M.B-Kombi, dieselbe Komponente) und die
 * Beleg-Zeilen beim „Bündel anlegen". Damit kann die Optik nicht auseinanderlaufen.
 *
 * Reine Anzeige: die Ableitungen („welche Varianten kommen vor", „braucht der Beleg
 * Sicherung") rechnet das Backend belegweit und liefert sie fertig mit — hier wird
 * nichts aus Positionen zusammengezählt.
 */
import type { JSX } from 'react';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import ShieldOutlinedIcon from '@mui/icons-material/ShieldOutlined';
import { LABEL_PRINT_VARIANT_DISPLAY, type LabelPrintVariant } from '@paket/domain-types';
import { LabelPrintVariantIcon } from '@paket/ui';

/**
 * Chip-Beschriftung je Druckvariante — bewusst kürzer als die volle Bezeichnung aus
 * domain-types, damit die Kachel nicht aufgeht. Die vollständige Bezeichnung liefert
 * der Tooltip, sie bleibt also erreichbar und die Sprache bleibt single-source.
 */
const VARIANT_CHIP_LABEL: Record<LabelPrintVariant, string> = {
  etikett_mit_preis: 'Etikett',
  digitag_etikett_ohne_preis: 'Digi Tag',
  kein_etikett: 'Kein Etikett',
};

export interface BelegInfoChipsProps {
  /** Filiale des Beleg-Kopfs. */
  branchNo: string;
  /** Alle Shops des Belegs, Primär-Shop zuerst; „+n" fasst die weiteren zusammen. */
  shopNos: readonly string[];
  /** Nur die TATSÄCHLICH vorkommenden Druckvarianten (Backend-Aggregat). */
  labelPrintVariants: readonly LabelPrintVariant[];
  /** Mindestens eine Position verlangt Sicherung (Backend-Aggregat). */
  securityRequired: boolean;
}

export function BelegInfoChips({
  branchNo,
  shopNos,
  labelPrintVariants,
  securityRequired,
}: BelegInfoChipsProps): JSX.Element {
  const [primaryShop, ...weitereShops] = shopNos;

  return (
    <Stack
      direction="row"
      gap={0.25}
      flexWrap="wrap"
      sx={{
        '& .MuiChip-root': { height: 18 },
        '& .MuiChip-label': { px: 0.5, fontSize: '0.65rem' },
      }}
    >
      {branchNo !== '' && (
        <Tooltip title="Filiale">
          <Chip size="small" variant="outlined" label={`Fil. ${branchNo}`} />
        </Tooltip>
      )}
      {primaryShop !== undefined && (
        <Tooltip title={weitereShops.length > 0 ? `Shops: ${shopNos.join(', ')}` : 'Shop'}>
          <Chip
            size="small"
            variant="outlined"
            label={
              weitereShops.length > 0
                ? `Shop ${primaryShop} +${weitereShops.length}`
                : `Shop ${primaryShop}`
            }
          />
        </Tooltip>
      )}
      {labelPrintVariants.map((variant) => (
        <Tooltip key={variant} title={LABEL_PRINT_VARIANT_DISPLAY[variant].label}>
          <Chip
            size="small"
            variant="outlined"
            color={variant === 'kein_etikett' ? 'default' : 'info'}
            icon={<LabelPrintVariantIcon variant={variant} sx={{ fontSize: 12 }} />}
            label={VARIANT_CHIP_LABEL[variant]}
          />
        </Tooltip>
      ))}
      {securityRequired && (
        <Tooltip title="Sicherung: mindestens eine Position muss gesichert werden">
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            icon={<ShieldOutlinedIcon sx={{ fontSize: 12 }} />}
            label="Sicherung"
          />
        </Tooltip>
      )}
    </Stack>
  );
}

/**
 * Piktogramm der Etikett-Druckvariante — als MUI-Icon, nicht als Emoji.
 *
 * Dieselbe Aufteilung wie bei den Status-Chips (Anhang E.6): `@paket/domain-types`
 * kennt die Variante und ihre deutsche Beschriftung (`LABEL_PRINT_VARIANT_DISPLAY`),
 * das Symbol lebt hier im Frontend-Paket — so bleibt domain-types frei von
 * React/MUI und beide Oberflächen (PWA, Teamlead-Cockpit) zeigen dasselbe Symbol.
 *
 * Emojis rendern je nach Gerät und Plattform unterschiedlich; Icons sind
 * themebar, skalieren mit `fontSize` und folgen der Textfarbe.
 *
 * Barrierefreiheit: das Icon steht IMMER neben seiner Beschriftung — es ist rein
 * dekorativ (`aria-hidden`), die Bedeutung trägt der Text.
 */
import type { JSX } from 'react';
import type { SvgIconComponent } from '@mui/icons-material';
import type { SvgIconProps } from '@mui/material/SvgIcon';
import BlockOutlined from '@mui/icons-material/BlockOutlined';
import ContactlessOutlined from '@mui/icons-material/ContactlessOutlined';
import LocalOfferOutlined from '@mui/icons-material/LocalOfferOutlined';
import type { LabelPrintVariant } from '@paket/domain-types';

/**
 * Variante → Symbol. Bewusst deutlich unterscheidbare Formen, die auch bei
 * 16 px in der Beleg-Zeile noch auseinanderzuhalten sind: klassisches
 * Preisschild, Funkwellen für die digitale Auszeichnung (DigiTag),
 * durchgestrichener Kreis für „gar kein Etikett".
 */
export const LABEL_PRINT_VARIANT_ICON: Record<LabelPrintVariant, SvgIconComponent> = {
  etikett_mit_preis: LocalOfferOutlined,
  digitag_etikett_ohne_preis: ContactlessOutlined,
  kein_etikett: BlockOutlined,
};

export interface LabelPrintVariantIconProps extends SvgIconProps {
  variant: LabelPrintVariant;
}

export function LabelPrintVariantIcon({
  variant,
  ...props
}: LabelPrintVariantIconProps): JSX.Element {
  const Icon = LABEL_PRINT_VARIANT_ICON[variant];
  return <Icon aria-hidden {...props} />;
}

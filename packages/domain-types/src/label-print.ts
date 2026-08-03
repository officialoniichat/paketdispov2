import { labelPrintVariantSchema, type LabelPrintVariant } from './enums.js';

/**
 * Ableitungen rund um die Etikett-Druckvariante einer Position
 * ({@link labelPrintVariantSchema}) — die EINZIGE Quelle dieser Fachlogik.
 *
 * Backend (Kopf-Ableitung, Arbeitsanweisung) und beide UIs (PWA, Teamlead)
 * rechnen NICHT selbst: sie fragen hier. Damit gibt es genau eine Wahrheit
 * darüber, ob überhaupt ein Etikett gedruckt wird, ob ein AUFGEDRUCKTER Preis zu
 * prüfen ist und wie die Variante heißt.
 */

/** Anzeige-Reihenfolge der Varianten (klassisch → digital → ohne Etikett). */
export const LABEL_PRINT_VARIANT_ORDER: readonly LabelPrintVariant[] =
  labelPrintVariantSchema.options;

/** Anzeige-Vokabular je Variante — identisch in PWA und Teamlead-Cockpit. */
export interface LabelPrintVariantDisplay {
  /** Piktogramm-Emoji, das die Variante auf einen Blick unterscheidbar macht. */
  icon: string;
  /** Volle Beschriftung, z. B. „DigiTag · Etikett ohne Preis". */
  label: string;
  /** Kurzform für enge Zusammenfassungen, z. B. „DigiTag · ohne Preis". */
  shortLabel: string;
}

export const LABEL_PRINT_VARIANT_DISPLAY: Record<LabelPrintVariant, LabelPrintVariantDisplay> = {
  etikett_mit_preis: {
    icon: '🏷️',
    label: 'Etikett mit Preis',
    shortLabel: 'Etikett mit Preis',
  },
  digitag_etikett_ohne_preis: {
    icon: '📟',
    label: 'DigiTag · Etikett ohne Preis',
    shortLabel: 'DigiTag · ohne Preis',
  },
  kein_etikett: {
    icon: '🚫',
    label: 'Kein Etikett',
    shortLabel: 'Kein Etikett',
  },
};

/** Beschriftung inkl. Piktogramm, z. B. „📟 DigiTag · Etikett ohne Preis". */
export function labelPrintVariantText(variant: LabelPrintVariant): string {
  const display = LABEL_PRINT_VARIANT_DISPLAY[variant];
  return `${display.icon} ${display.label}`;
}

/**
 * Wird für diese Position überhaupt ein physisches Etikett gedruckt/angebracht?
 * Digi-Tag-Ware zählt mit: das Etikett läuft trotzdem über den Drucker, nur ohne
 * Preis. Genau das entscheidet, ob der Mitarbeiter zur Druckstation muss.
 */
export function labelPrintRequired(variant: LabelPrintVariant): boolean {
  return variant !== 'kein_etikett';
}

/**
 * Gibt es an dieser Position einen AUFGEDRUCKTEN Preis zu prüfen? Nur beim
 * klassischen Etikett — bei Digi-Tag- und Ohne-Etikett-Positionen steht kein
 * Preis auf dem Etikett, es gibt also nichts abzugleichen.
 */
export function printedPriceCheckRequired(variant: LabelPrintVariant): boolean {
  return variant === 'etikett_mit_preis';
}

/**
 * Welche Varianten kommen auf diesem Beleg TATSÄCHLICH vor — dedupliziert und in
 * der Anzeige-Reihenfolge. Ein reiner Digi-Tag-Beleg liefert genau einen Eintrag,
 * ein Misch-Beleg mehrere.
 */
export function summarizeLabelPrintVariants(
  variants: readonly LabelPrintVariant[],
): LabelPrintVariant[] {
  const present = new Set(variants);
  return LABEL_PRINT_VARIANT_ORDER.filter((variant) => present.has(variant));
}

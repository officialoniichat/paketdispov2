import type { EffortPreviewComponent } from '@paket/assignment-engine';

/**
 * Single source for the German labels + display order of the §8.2 effort formula terms,
 * reused by the Admin "Aufwand"-Vorschau and the Belegdetail-Aufwandsaufschlüsselung so
 * both surfaces stay consistent.
 */
export type EffortComponentKey = EffortPreviewComponent['key'];

export const EFFORT_COMPONENT_ORDER: readonly EffortComponentKey[] = [
  'base',
  'quantity',
  'priceLabelPrint',
  'labelAttach',
  'security',
  'online',
  'redPrice',
  'check',
  'handling',
];

export const EFFORT_COMPONENT_LABEL: Record<EffortComponentKey, string> = {
  base: 'Grundzeit je Beleg',
  quantity: 'Mengenerfassung',
  priceLabelPrint: 'Etiketten drucken',
  labelAttach: 'Etiketten anbringen',
  security: 'Warensicherung',
  online: 'Online-Behandlung',
  redPrice: 'Rotpreis-Auszeichnung',
  check: 'Prüfung (Mehraufwand)',
  handling: 'Handling / Füllmaterial',
};

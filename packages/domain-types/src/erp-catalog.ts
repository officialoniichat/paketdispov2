import { z } from 'zod';
import { idSchema } from './primitives.js';
import { inspectionLevelCodeSchema } from './enums.js';

/**
 * Mock-ERP-Kataloge (Teamlead-Feedback 03.07.2026). ProHandel ist System of Record;
 * bis zur echten Anbindung liefern diese Kataloge die Anzeige-Stammdaten, die auf dem
 * WE-Beleg-Papier stehen: WGR-Klartexte, Prüfstufen mit Aufgabentext und die
 * Online-Größen-Präferenzen für die Rot/Grün-Hervorhebung in der Mitarbeiter-App.
 */

/** Warengruppen-Katalogeintrag, z. B. `218110` → „D-Bermuda". */
export const wgrCatalogEntrySchema = z.object({
  wgr: z.string().min(1),
  description: z.string().min(1),
});
export type WgrCatalogEntry = z.infer<typeof wgrCatalogEntrySchema>;

/** Mock-WGR-Katalog (Seed + Mock-Connector teilen dieselben Stammdaten). */
export const DEFAULT_WGR_CATALOG: readonly WgrCatalogEntry[] = [
  { wgr: '218110', description: 'D-Bermuda' },
  { wgr: '111130', description: 'H-Poloshirt' },
  { wgr: '214520', description: 'D-Bluse' },
  { wgr: '312400', description: 'H-Jeans' },
  { wgr: '415210', description: 'D-Blazer' },
  { wgr: '511100', description: 'K-T-Shirt' },
  { wgr: '618300', description: 'D-Kleid' },
  { wgr: '711250', description: 'H-Sakko' },
  { wgr: '812770', description: 'Koffer/Reisegepäck' },
  { wgr: '4711', description: 'D-Shirt Basic' },
  { wgr: '4712', description: 'D-Hose Basic' },
];

/** Sicherungstyp-Piktogramm-Codes, die das Backend als Mock-Assets ausliefert (A4). */
export const SECURITY_PICTOGRAM_CODES: readonly string[] = [
  'hard-tag',
  'ink-tag',
  'spider-wrap',
  'safer-box',
  'cable-lock',
];

/**
 * Prüfstufe des Wareneingangs: Prozentsatz + erklärender Text der nötigen Todos
 * (z. B. „20 %: jede fünfte Position vollständig zählen und Größenlauf prüfen").
 */
export const inspectionLevelSchema = z.object({
  code: inspectionLevelCodeSchema,
  label: z.string().min(1),
  /** Prüfanteil in Prozent (0 = keine Prüfung, 100 = Vollprüfung). */
  percentage: z.number().min(0).max(100),
  /** Erklärtext: welche Todos diese Prüfstufe für den Mitarbeiter bedeutet. */
  description: z.string().min(1),
});
export type InspectionLevel = z.infer<typeof inspectionLevelSchema>;

/** Fester Prüfstufen-Katalog (mock; Quelle ProHandel vs. Dashboard konfigurierbar). */
export const DEFAULT_INSPECTION_LEVELS: readonly InspectionLevel[] = [
  {
    code: 'none',
    label: 'Nein',
    percentage: 0,
    description:
      'Keine Wareneingangsprüfung. Nur Mindestmengen-Check: Kartons zählen und Beleg-Gesamtmenge plausibilisieren.',
  },
  {
    code: 'p10',
    label: '10 %',
    percentage: 10,
    description:
      'Stichprobe 10 %: jede zehnte Position vollständig auszählen (EAN, Größe, Menge) und Abweichungen als Problem melden.',
  },
  {
    code: 'p20',
    label: '20 %',
    percentage: 20,
    description:
      'Stichprobe 20 %: jede fünfte Position vollständig auszählen, zusätzlich Größenlauf und Farbe gegen die Arbeitsanweisung prüfen.',
  },
  {
    code: 'full',
    label: 'Voll',
    percentage: 100,
    description:
      'Vollprüfung: jede Position und jede EAN/Größen-Zeile komplett zählen, Preise/Etiketten kontrollieren und jede Abweichung dokumentieren.',
  },
];

/**
 * Online-Größen-Präferenz je WGR + Größenvariante (A8): bevorzugte Größe fürs
 * Online-Lager plus definierte Ausweichgröße. Grundlage der Rot/Grün-Hervorhebung
 * in der PWA; gepflegt per Admin-CSV-Upload.
 */
export const onlineSizePreferenceSchema = z.object({
  id: idSchema,
  wgr: z.string().min(1),
  /** Größenvariante/-lauf, z. B. `konfektion`, `jeans-inch`, `schuhe`. */
  sizeVariant: z.string().min(1),
  preferredSize: z.string().min(1),
  alternativeSize: z.string().optional(),
});
export type OnlineSizePreference = z.infer<typeof onlineSizePreferenceSchema>;

/** CSV-Upload-Zeile (ohne id — Upsert-Schlüssel ist [wgr, sizeVariant]). */
export const onlineSizePreferenceUploadRowSchema = onlineSizePreferenceSchema.omit({ id: true });
export type OnlineSizePreferenceUploadRow = z.infer<typeof onlineSizePreferenceUploadRowSchema>;

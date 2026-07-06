// Zeit-getriebene Szenarien: B10 Schichtende (Cutoff + shift_ending + normales
// Fertigwerden) und B11 Feiertag/Sonderregelung (Verladeplan-Sonderzeile DO→MI).
// Beide sind für den Dev-Zeit-Override gebaut: die Beschreibung nennt die Uhrzeit/
// Tage, die man einstellen soll; alle Daten hängen deterministisch an ctx.baseDate.
import { DEFAULT_RULE_CONFIG, type LoadPlanRow } from '@paket/domain-types';
import { asDate, seedMasterData, forceRuleConfig } from '../lib.js';
import { seedCaseDetails } from '../case-builders.js';
import type { ScenarioDefinition } from '../types.js';
import { seedCustomCases, type CustomCaseSpec } from './custom-case.js';

// --- B10 Schichtende ---------------------------------------------------------------

const B10_CASES: CustomCaseSpec[] = Array.from({ length: 12 }, (_, i) => {
  const n = String(9_406_001 + i * 4).padStart(7, '0');
  return {
    weBelegNo: `${n.slice(0, 1)}.${n.slice(1, 4)}.${n.slice(4)}`,
    storageCode: ['R3', 'R7', 'HB-5/234', 'PA-1'][i % 4]!,
    totalQuantity: 55,
    section: null,
  } satisfies CustomCaseSpec;
});

export const schichtendeScenario: ScenarioDefinition = {
  key: 'schichtende',
  name: 'Schichtende (Cutoff 50 min)',
  description:
    '12 mittlere Belege plus die normalen Schichten (Frühschicht 06:00–14:00, ' +
    'Spätschicht 10:00–18:00) mit dem Default-Cutoff von 50 Minuten (Cutoff-Punkte ' +
    '13:10 bzw. 17:10). Demo-Ablauf mit dem Zeit-Override: (1) Vormittags-Zeit setzen ' +
    '(z. B. 09:00) und „Automatik ausführen" → voller Plan. (2) Zeit auf 13:25 stellen ' +
    'und erneut „Automatik ausführen" → die NICHT begonnenen Frühschicht-Bündel lösen ' +
    'sich in den Pool auf, nur die Spätschicht wird neu beplant. (3) Zeit auf 13:50: ' +
    'Self-Pull eines Frühschichtlers (z. B. Anna Berger) → „shift_ending".',
  expectedOutcome:
    'Bei Zeit 13:25 (nach Cutoff-Punkt 13:10) erhält KEIN Frühschichtler mehr Arbeit ' +
    'aus der Automatik — vorher zugeteilte, nicht begonnene Bündel sind aufgelöst und ' +
    'die Belege zurück im Pool; die Spätschicht (bis 18:00) wird normal beplant und ' +
    'arbeitet fertig. Self-Pull kurz vor 14:00 antwortet „shift_ending" (kein Bündel, ' +
    'das nicht mehr vor Schichtende fertig würde).',
  async seed(ctx) {
    await forceRuleConfig(ctx.prisma);
    const { locationIds } = await seedMasterData(ctx);
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, B10_CASES);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

// --- B11 Feiertag / Sonderregelung -----------------------------------------------------

/** ISO-Datum des nächsten Wochentags (0=So..6=Sa) am/nach `fromIso`. */
function nextWeekdayOnOrAfter(fromIso: string, weekdayIndex: number): string {
  const from = asDate(fromIso);
  const delta = (weekdayIndex - from.getUTCDay() + 7) % 7;
  from.setUTCDate(from.getUTCDate() + delta);
  return from.toISOString().slice(0, 10);
}

function shiftIso(iso: string, days: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const feiertagSonderregelungScenario: ScenarioDefinition = {
  key: 'feiertag-sonderregelung',
  name: 'Feiertag / Sonderregelung (DO→MI)',
  description:
    'Verladeplan mit Sonderregelung: Shopbereich 23/EG verlädt regulär donnerstags; ' +
    'wegen Feiertag zieht eine Sonderzeile (specialDay) die Verladung auf den Mittwoch ' +
    'davor vor — innerhalb ihres Gültigkeitsfensters unterdrückt sie den regulären ' +
    'Donnerstags-Termin. Beleg 9.407.010 (Shop 23/EG, Abschnitt 1) hängt an dieser ' +
    'Regel; Vergleichs-Beleg 9.407.020 (Shop 21/EG, Abschnitt 1) behält seinen ' +
    'regulären Montags-Termin. Daten relativ zum Ladetag des Szenarios: Donnerstag = ' +
    'nächster DO ab heute, Mittwoch = der Tag davor.',
  expectedOutcome:
    'Admin → Verladeplan zeigt die Sonderzeile (Shop 23/EG, specialDay, Fenster ' +
    'Mi–Do). Nach „Automatik ausführen" trägt 9.407.010 als Verladetag den ' +
    'VORGEZOGENEN Mittwoch (nicht den Donnerstag) — fällt der Mittwoch auf heute oder ' +
    'früher, ist der Beleg sofort Verladeplan-fällig/überfällig (Tier 3). ' +
    '9.407.020 (Shop 21/EG) behält den regulären Montag aus dem Wochenplan.',
  async seed(ctx) {
    const thursday = nextWeekdayOnOrAfter(ctx.baseDate, 4);
    const wednesday = shiftIso(thursday, -1);
    // Buchungstag = Freitag VOR dem Ziel-Donnerstag: so ist der nächste reguläre
    // DO-Kandidat ab Buchungsdatum GENAU der Sonder-Donnerstag (und nie ein früherer,
    // der außerhalb des Sonderfensters läge) — robust für jeden baseDate-Wochentag.
    const bookingIso = shiftIso(thursday, -6);
    const bookingOffsetDays = Math.round(
      (asDate(ctx.baseDate).getTime() - asDate(bookingIso).getTime()) / 86_400_000,
    );
    const loadPlan: LoadPlanRow[] = [
      ...DEFAULT_RULE_CONFIG.loadPlan,
      // Regulärer Wochenplan: Shop 23/EG verlädt donnerstags.
      { id: 'lp-23-do', shopAreaNo: '23', floor: 'EG', weekday: 'Do', validFrom: '2026-01-01', specialDay: false },
      // Sonderregelung: Feiertags-Donnerstag → Verladung auf Mittwoch vorgezogen; das
      // Fenster [Mi, Do] unterdrückt den regulären DO-Termin.
      { id: 'lp-23-sonder', shopAreaNo: '23', floor: 'EG', weekday: 'Mi', validFrom: wednesday, validTo: thursday, specialDay: true },
    ];
    await forceRuleConfig(ctx.prisma, { loadPlan });
    const { locationIds } = await seedMasterData(ctx);
    const cases: CustomCaseSpec[] = [
      { weBelegNo: '9.407.010', storageCode: 'R7', totalQuantity: 36, section: 1, shopAreaNo: '23', floor: 'EG', bookingOffsetDays },
      { weBelegNo: '9.407.020', storageCode: 'R11', totalQuantity: 32, section: 1, shopAreaNo: '21', floor: 'EG', bookingOffsetDays },
      { weBelegNo: '9.407.101', storageCode: 'R3', totalQuantity: 45, section: null },
      { weBelegNo: '9.407.105', storageCode: 'PA-1', totalQuantity: 40, section: null },
    ];
    await seedCustomCases(ctx.prisma, ctx.baseDate, locationIds, cases);
    await seedCaseDetails(ctx.prisma, new Map());
  },
};

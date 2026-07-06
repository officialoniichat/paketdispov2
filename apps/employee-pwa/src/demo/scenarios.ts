/**
 * Demo-scenario catalog for the offline pilot. Each scenario is a different
 * Belegset (bundle) the demo can switch between to show the one-screen flow and
 * the Arbeitsanweisung variants. Only used in offline-demo mode; in backend mode
 * the real engine bundle is loaded instead. The default scenario mixes
 * Regal + Hängebahn + Palette in one Bündel (Dustin A1).
 */
import {
  assembleScenario,
  EXAMPLE_SCENARIO_INPUT,
  type AssembledScenario,
} from '../domain/exampleAssignment.js';

export interface DemoScenario {
  id: string;
  label: string;
  description: string;
  build: () => AssembledScenario;
}

/**
 * Standard: gemischtes Bündel (Regal + Hängebahn + Palette) — the offline mirror
 * of the backend dev scenario 'gemischtes-buendel' (B3): one assignment whose
 * route/cases span all three Bereiche with real Lagerplatz-Stamm codes
 * (R27 / HB-5/234 / PA-1), Teile counts and Bereich icons.
 */
const standard: DemoScenario = {
  id: 'standard',
  label: 'Gemischtes Bündel · Regal + Hängebahn + Palette (3 Belege)',
  description:
    'Spiegel des Dev-Szenarios „Gemischtes Bündel" (B3): Regal, Hängebahn und Palette in einem Bündel — mit Rotpreis, Online, Sicherung und Stichprobe (Anhang-G-Beispiel).',
  build: () => assembleScenario(EXAMPLE_SCENARIO_INPUT),
};

/** Hängebahn bundle — homogeneous Bereich, 2 Belege, one with security pictogram. */
const haengeware: DemoScenario = {
  id: 'haengeware',
  label: 'Hängeware · Hängebahn (2 Belege)',
  description: 'Bündel im Bereich Hängebahn mit Sicherung.',
  build: () =>
    assembleScenario({
      bundleId: 'bundle-demo-haenge',
      employeeName: 'Anna',
      bereich: 'Hängebahn',
      cases: [
        {
          id: 'demo-hb-1',
          weBelegNo: '3700101',
          weShort: '3700101',
          locationCode: 'HB-6/118',
          locationType: 'haengebahn',
          goodsType: 'haengeware',
          totalQuantity: 6,
          goodsTypeText: 'Nachorder',
          inboundCartonCount: 1,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '820100-Wollmantel',
              supplierColor: '90010-anthrazit',
              wgr: '415210',
              priceLabelAttachLocation: 'Innenkragen',
              securityRequired: true,
              securityLocation: 'Ärmelsaum',
              securityTypeCode: 'ink-tag',
              skus: [
                { ean: '4068657040011', size: '38', quantity: 3, ekPrice: 89, vkPrice: 199 },
                { ean: '4068657040028', size: '40', quantity: 3, ekPrice: 89, vkPrice: 199 },
              ],
            },
          ],
        },
        {
          id: 'demo-hb-2',
          weBelegNo: '3700102',
          weShort: '3700102',
          locationCode: 'HB-7/090',
          locationType: 'haengebahn',
          goodsType: 'haengeware',
          totalQuantity: 4,
          goodsTypeText: 'NOS',
          inboundCartonCount: 1,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '820200-Blazer',
              supplierColor: '40300-marine',
              wgr: '415210',
              skus: [{ ean: '4068657040103', size: 'M', quantity: 4, ekPrice: 55, vkPrice: 129 }],
            },
          ],
        },
      ],
    }),
};

/** Large bundle — 4 Belege across several Regal locations, all variant flags. */
const gross: DemoScenario = {
  id: 'gross',
  label: 'Großbündel · Regal (4 Belege)',
  description: 'Volles Bündel mit Stichprobe %, Sicherung, Online und Rotpreis.',
  build: () =>
    assembleScenario({
      bundleId: 'bundle-demo-gross',
      employeeName: 'Anna',
      bereich: 'Regal',
      cases: [
        {
          id: 'demo-g-1',
          weBelegNo: '3800001',
          weShort: '3800001',
          locationCode: 'R3',
          goodsType: 'regal',
          totalQuantity: 6,
          goodsTypeText: 'Vororder',
          inboundCartonCount: 2,
          wi: {
            goodsReceiptCheckMode: 'percentage_check',
            goodsReceiptCheckPercentage: 30,
            inspectionLevelCode: 'p20',
          },
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410100-Shirt',
              supplierColor: '10000-weiß',
              wgr: '511100',
              priceLabelAttachLocation: 'Seitennaht',
              redPriceRequired: true,
              skus: [{ ean: '4068657050017', size: 'L', quantity: 6, ekPrice: 8, vkPrice: 19.99, vkLabelPrice: 14.99 }],
            },
          ],
        },
        {
          id: 'demo-g-2',
          weBelegNo: '3800002',
          weShort: '3800002',
          locationCode: 'R11',
          goodsType: 'regal',
          totalQuantity: 8,
          goodsTypeText: 'Nachorder',
          inboundCartonCount: 1,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410200-Hose',
              supplierColor: '20000-blau',
              wgr: '312400',
              securityRequired: true,
              securityLocation: 'Bund hinten',
              securityTypeCode: 'spider-wrap',
              notes: 'Hochwertig – Diebstahlschutz',
              skus: [
                { ean: '4068657050116', size: '48', quantity: 4, ekPrice: 32, vkPrice: 79.95 },
                { ean: '4068657050123', size: '50', quantity: 4, ekPrice: 32, vkPrice: 79.95 },
              ],
            },
          ],
        },
        {
          id: 'demo-g-3',
          weBelegNo: '3800003',
          weShort: '3800003',
          locationCode: 'R11',
          goodsType: 'regal',
          totalQuantity: 5,
          goodsTypeText: 'Extrabestellung',
          inboundCartonCount: 1,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410300-Jacke',
              supplierColor: '30000-oliv',
              wgr: '210300',
              onlineRelevant: true,
              onlineHandlingRequired: true,
              onlineHandlingLocation: 'Online-Tisch B',
              skus: [{ ean: '4068657050215', size: 'M', quantity: 5, ekPrice: 45, vkPrice: 109 }],
            },
          ],
        },
        {
          id: 'demo-g-4',
          weBelegNo: '3800004',
          weShort: '3800004',
          locationCode: 'R23',
          goodsType: 'regal',
          totalQuantity: 9,
          goodsTypeText: 'Vororder',
          inboundCartonCount: 4,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410400-Pulli',
              supplierColor: '40000-grau',
              wgr: '218110',
              skus: [
                { ean: '4068657050314', size: 'S', quantity: 3 },
                { ean: '4068657050321', size: 'M', quantity: 3 },
                { ean: '4068657050338', size: 'L', quantity: 3 },
              ],
            },
          ],
        },
      ],
    }),
};

export const DEMO_SCENARIOS: readonly DemoScenario[] = [standard, haengeware, gross];
export const DEFAULT_SCENARIO_ID = standard.id;

/** Resolve a scenario by id, falling back to the default. */
export function getScenario(id: string | null | undefined): DemoScenario {
  return DEMO_SCENARIOS.find((s) => s.id === id) ?? standard;
}

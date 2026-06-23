/**
 * Demo-scenario catalog for the offline pilot. Each scenario is a different
 * Belegset (bundle) the demo can switch between to show the two-phase flow and
 * the Arbeitsanweisung variants. Only used in offline-demo mode; in backend mode
 * the real engine bundle is loaded instead.
 */
import {
  assembleScenario,
  exampleAggregates,
  exampleBelegList,
  exampleBundle,
  exampleCollectStops,
  type AssembledScenario,
} from '../domain/exampleAssignment.js';

export interface DemoScenario {
  id: string;
  label: string;
  description: string;
  build: () => AssembledScenario;
}

/** Standard Anhang-G Regal bundle (3 Belege, R27 + A-4) — the canonical example. */
const standard: DemoScenario = {
  id: 'standard',
  label: 'Standard · Regal (3 Belege)',
  description: 'Anhang-G Beispiel: Regal-Bündel mit Rotpreis, Online und Stichprobe.',
  build: () => ({
    bundle: exampleBundle,
    collectStops: exampleCollectStops,
    belege: exampleBelegList,
    aggregates: exampleAggregates,
  }),
};

/** Hängebahn bundle — different Bereich, 2 Belege, one with security. */
const haengeware: DemoScenario = {
  id: 'haengeware',
  label: 'Hängeware · Hängebahn (2 Belege)',
  description: 'Bündel im Bereich Hängebahn mit Sicherung.',
  build: () =>
    assembleScenario({
      bundleId: 'bundle-demo-haenge',
      employeeName: 'Anna',
      workstation: 'Hängebahn 2',
      bereich: 'Hängebahn',
      cases: [
        {
          id: 'demo-hb-1',
          weBelegNo: '3700101',
          weShort: '3700101',
          locationCode: 'HB-3',
          locationType: 'haengebahn',
          goodsType: 'haengeware',
          totalQuantity: 6,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '820100-Wollmantel',
              supplierColor: '90010-anthrazit',
              wgr: '230400',
              priceLabelAttachLocation: 'Innenkragen',
              securityRequired: true,
              securityLocation: 'Ärmelsaum',
              skus: [
                { ean: '4068657040011', size: '38', quantity: 3 },
                { ean: '4068657040028', size: '40', quantity: 3 },
              ],
            },
          ],
        },
        {
          id: 'demo-hb-2',
          weBelegNo: '3700102',
          weShort: '3700102',
          locationCode: 'HB-5',
          locationType: 'haengebahn',
          goodsType: 'haengeware',
          totalQuantity: 4,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '820200-Blazer',
              supplierColor: '40300-marine',
              wgr: '230410',
              skus: [{ ean: '4068657040103', size: 'M', quantity: 4 }],
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
      workstation: 'Tisch 4',
      bereich: 'Regal',
      cases: [
        {
          id: 'demo-g-1',
          weBelegNo: '3800001',
          weShort: '3800001',
          locationCode: 'R3',
          goodsType: 'regal',
          totalQuantity: 6,
          wi: { goodsReceiptCheckMode: 'percentage_check', goodsReceiptCheckPercentage: 30 },
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410100-Shirt',
              supplierColor: '10000-weiß',
              wgr: '218000',
              priceLabelAttachLocation: 'Seitennaht',
              redPriceRequired: true,
              skus: [{ ean: '4068657050017', size: 'L', quantity: 6 }],
            },
          ],
        },
        {
          id: 'demo-g-2',
          weBelegNo: '3800002',
          weShort: '3800002',
          locationCode: 'R12',
          goodsType: 'regal',
          totalQuantity: 8,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410200-Hose',
              supplierColor: '20000-blau',
              wgr: '218100',
              securityRequired: true,
              securityLocation: 'Bund hinten',
              notes: 'Hochwertig – Diebstahlschutz',
              skus: [
                { ean: '4068657050116', size: '48', quantity: 4 },
                { ean: '4068657050123', size: '50', quantity: 4 },
              ],
            },
          ],
        },
        {
          id: 'demo-g-3',
          weBelegNo: '3800003',
          weShort: '3800003',
          locationCode: 'R12',
          goodsType: 'regal',
          totalQuantity: 5,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410300-Jacke',
              supplierColor: '30000-oliv',
              wgr: '210300',
              onlineHandlingRequired: true,
              onlineHandlingLocation: 'Online-Tisch B',
              skus: [{ ean: '4068657050215', size: 'M', quantity: 5 }],
            },
          ],
        },
        {
          id: 'demo-g-4',
          weBelegNo: '3800004',
          weShort: '3800004',
          locationCode: 'A-7',
          goodsType: 'regal',
          totalQuantity: 9,
          positions: [
            {
              positionNo: 1,
              supplierArticleNo: '410400-Pulli',
              supplierColor: '40000-grau',
              wgr: '218200',
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

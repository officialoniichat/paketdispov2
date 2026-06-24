import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const todayResponse = {
  date: '2026-06-15',
  bundle: {
    bundleId: 'bundle-2026-06-15-00',
    status: 'assigned',
    plannedEffortMinutes: 34,
    caseCount: 2,
    routeStops: [
      { id: 'rs-1', sequence: 1, locationCode: 'A-4', scanRequired: true, scanned: false },
      { id: 'rs-0', sequence: 0, locationCode: 'R27', scanRequired: false, scanned: false },
    ],
  },
  cases: [
    {
      id: 'c1',
      weBelegNo: '3656860',
      status: 'assigned',
      section: null,
      priorityFlags: [],
      totalQuantity: 9,
      estimatedMinutes: 14,
      storageLocationCode: 'R27',
      bookingDate: '2026-06-15',
      goodsType: 'Vororder',
    },
    {
      id: 'c2',
      weBelegNo: '3656862',
      status: 'assigned',
      section: null,
      priorityFlags: [],
      totalQuantity: 4,
      estimatedMinutes: 8,
      storageLocationCode: 'A-4',
      bookingDate: '2026-06-15',
      goodsType: null,
    },
  ],
};

const aggregateFor = (id: string) => ({
  case: todayResponse.cases.find((c) => c.id === id),
  workInstruction: {
    priceLabelPrintRequired: true,
    sortByArticleColorSizeRequired: true,
    goodsReceiptCheckMode: 'quantity_only',
    minimumQuantityCheckAlwaysRequired: true,
    boxLabelRequired: true,
    zstRequired: true,
  },
  positions: [
    {
      id: `${id}-p1`,
      positionNo: 1,
      wgr: '218110',
      supplierArticleNo: 'ART-1',
      supplierColor: 'black',
      season: 'HW25',
      nosFlag: true,
      branchNo: '1',
      shopNo: '2143',
      floor: 'EG',
      status: 'open',
      instruction: {
        priceLabelRequired: true,
        priceLabelAttachRequired: true,
        priceLabelAttachLocation: null,
        securityRequired: true,
        securityLocation: 'Naht innen',
        onlineHandlingRequired: false,
        onlineHandlingLocation: null,
        redPriceRequired: false,
        notes: 'Vorsicht',
      },
      skuLines: [
        {
          id: `${id}-p1-s1`,
          ean: '111',
          size: 'M',
          expectedQuantity: 2,
          confirmedQuantity: null,
          status: 'open',
        },
        {
          id: `${id}-p1-s2`,
          ean: '222',
          size: 'L',
          expectedQuantity: 1,
          confirmedQuantity: null,
          status: 'open',
        },
      ],
    },
  ],
  boxTargets: [],
  instructionPoints: [
    { pointNo: 1, key: 'price_label_print', label: 'Preisetikettendruck', value: 'Ja', scope: 'header' },
    {
      pointNo: 10,
      key: 'security',
      label: 'Sicherungsetikett',
      value: 'Sichern für die Position(en): 1',
      scope: 'position',
      positionNos: [1],
    },
  ],
});

const apiGet = vi.fn(async (path: string, opts?: { params?: { path?: { caseId?: string } } }) => {
  if (path === '/api/me/today') return { data: todayResponse, error: undefined };
  if (path === '/api/me/cases/{caseId}/aggregate') {
    return { data: aggregateFor(opts?.params?.path?.caseId ?? ''), error: undefined };
  }
  return { data: undefined, error: 'unknown path' };
});

const apiPost = vi.fn(
  async (
    _path: string,
  ): Promise<{ data: { assigned: boolean; reason?: string }; error: undefined }> => ({
    data: { assigned: false, reason: 'pool_empty' },
    error: undefined,
  }),
);

vi.mock('../data/api.js', () => ({
  getApiClient: () => ({ GET: apiGet, POST: apiPost }),
  isBackendEnabled: true,
}));
vi.mock('../data/session.js', () => ({
  getSession: () => ({ employeeNo: 'ma-101', displayName: 'Anna' }),
}));

import { PaketDb } from './db.js';
import { loadAssignedWork, pullNextBundle } from './sync.js';
import {
  getBelege,
  getBundle,
  getCollectStops,
  getBundleProgress,
  getAggregate,
} from './repository.js';

let counter = 0;
let db: PaketDb;

beforeEach(() => {
  db = new PaketDb(`test-sync-${counter++}`);
  apiGet.mockClear();
});

describe('loadAssignedWork', () => {
  it('mirrors the engine bundle into a bundle context', async () => {
    const result = await loadAssignedWork(db);
    expect(result.caseCount).toBe(2);
    const bundle = await getBundle(db);
    expect(bundle).toMatchObject({
      id: 'today',
      bundleId: 'bundle-2026-06-15-00',
      employeeName: 'Anna',
      date: '2026-06-15',
      plannedEffortMinutes: 34,
      caseIds: ['c1', 'c2'],
    });
  });

  it('builds the route-ordered collect stops with the Belege at each location', async () => {
    await loadAssignedWork(db);
    const stops = await getCollectStops(db);
    expect(stops.map((s) => s.locationCode)).toEqual(['R27', 'A-4']);
    expect(stops[0]).toMatchObject({ sequence: 0, scanRequired: false, caseIds: ['c1'] });
    expect(stops[1]).toMatchObject({ sequence: 1, scanRequired: true, caseIds: ['c2'] });
  });

  it('orders the Beleg list by the bundle order', async () => {
    await loadAssignedWork(db);
    const belege = await getBelege(db);
    expect(belege.sort((a, b) => a.order - b.order).map((b) => b.caseId)).toEqual(['c1', 'c2']);
  });

  it('starts collect progress empty', async () => {
    await loadAssignedWork(db);
    expect((await getBundleProgress(db))?.collectedSequences).toEqual([]);
  });

  it('maps the real multi-SKU lines of each Beleg', async () => {
    await loadAssignedWork(db);
    const agg = await getAggregate('c1', db);
    expect(agg?.positions[0]?.skuLines.map((s) => s.expectedQuantity)).toEqual([2, 1]);
  });

  it('maps the real per-position Arbeitsanweisung instruction (no placeholders)', async () => {
    await loadAssignedWork(db);
    const agg = await getAggregate('c1', db);
    expect(agg?.positions[0]?.instruction).toMatchObject({
      securityRequired: true,
      securityLocation: 'Naht innen',
      notes: 'Vorsicht',
    });
  });

  it('carries the ordered Arbeitsanweisung points', async () => {
    await loadAssignedWork(db);
    const agg = await getAggregate('c1', db);
    expect(agg?.instructionPoints.map((p) => p.key)).toEqual(['price_label_print', 'security']);
  });

  it('maps the per-position NOS flag and Saison (Warenbezeichnung identity)', async () => {
    await loadAssignedWork(db);
    const agg = await getAggregate('c1', db);
    expect(agg?.positions[0]).toMatchObject({ nosFlag: true, season: 'HW25' });
  });

  it('maps the Beleg-Kopf Warenart (goodsTypeText) from the case summary', async () => {
    await loadAssignedWork(db);
    const agg = await getAggregate('c1', db);
    expect(agg?.case.goodsTypeText).toBe('Vororder');
  });
});

describe('pullNextBundle (continuation)', () => {
  it('reports the backend reason and does NOT re-sync when nothing is free', async () => {
    apiPost.mockResolvedValueOnce({ data: { assigned: false, reason: 'pool_empty' }, error: undefined });
    apiGet.mockClear();
    const result = await pullNextBundle(db);
    expect(result).toEqual({ assigned: false, reason: 'pool_empty' });
    expect(apiGet).not.toHaveBeenCalled();
  });

  it('re-syncs the freshly assigned bundle when a cart was pulled', async () => {
    apiPost.mockResolvedValueOnce({ data: { assigned: true }, error: undefined });
    apiGet.mockClear();
    const result = await pullNextBundle(db);
    expect(result.assigned).toBe(true);
    expect(apiGet).toHaveBeenCalledWith('/api/me/today');
  });
});

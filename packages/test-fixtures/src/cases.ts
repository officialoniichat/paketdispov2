import { goodsReceiptCaseSchema, type GoodsReceiptCase } from '@paket/domain-types';

/** Anonymised sample: a prio case with no section (Prio != Abschnitt guardrail). */
export const samplePrioCase: GoodsReceiptCase = goodsReceiptCaseSchema.parse({
  id: 'case-sample-0001',
  source: 'prohandel_api',
  externalRef: 'ph-sample-0001',
  weBelegNo: 'WE-2026-000123',
  deliveryNoteNo: 'LS-2026-000123',
  bookingDate: '2026-06-15',
  branchNo: '001',
  storageLocation: { id: 'loc-r27', type: 'regal', code: 'R27', active: true },
  section: null,
  goodsTypeText: 'Prio',
  priorityFlags: ['prio'],
  totalQuantity: 84,
  status: 'ready',
  effortPoints: 18.5,
  estimatedMinutes: 42,
  version: 0,
});

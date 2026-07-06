// Hand-crafted case specs for the B2–B15 demo scenarios: a thin, fully explicit
// upsert over GoodsReceiptCase (every prioritäts-/gruppierungs-relevante Stellschraube
// steuerbar) plus a minimal detail aggregate and a Vortages-Bündel helper for
// Fortsetzungs-Demos. Deterministic: no RNG, all dates relative to `baseDate`.
import type { CaseStatus, GoodsTypeText, PriorityFlag } from '@prisma/client';
import { offsetDate, requireId, round2 } from '../lib.js';
import type { ScenarioPrisma } from '../types.js';

export interface CustomCaseSpec {
  weBelegNo: string;
  /** Lagerplatz-Code aus LOCATIONS; `null` = fehlt (nur für blocked erlaubt). */
  storageCode: string | null;
  totalQuantity: number;
  /** Default 'ready'. */
  status?: CaseStatus;
  /** `null` = Lieferschein fehlt; default abgeleitet aus der Belegnummer. */
  deliveryNoteNo?: string | null;
  missingFields?: string[];
  /** Default null (kein Abschnitt). */
  section?: number | null;
  /** Default 'Vororder'. */
  goodsTypeText?: GoodsTypeText | null;
  priorityFlags?: PriorityFlag[];
  /** Tage VOR baseDate gebucht (0 = heute). Default 0. */
  bookingOffsetDays?: number;
  /** Verladetag relativ zu baseDate (0 = heute fällig, negativ = überfällig). */
  loadPlanOffsetDays?: number | null;
  /** Default '21'. */
  shopAreaNo?: string;
  /** Default 'EG'. */
  floor?: string;
  /** T1-Gruppierungssignal „Lieferschein X von N". */
  deliverySourceGroupKey?: string;
  deliverySourceGroupSize?: number;
  deliveryGroupReleased?: boolean;
  forwardedTo?: 'retourenabteilung' | 'lieferscheinbucher';
  attentionNote?: string;
  /** Zusatz-Hinweis im externalRef (z. B. Kartonnummern der Brax-Lieferung). */
  externalRefSuffix?: string;
  /** Default aus der Teile-Zahl abgeleitet (Generator-Formel). */
  estimatedMinutes?: number;
}

/** Aufwands-Default: dieselbe Intuition wie der Volumen-Generator. */
export function defaultMinutes(totalQuantity: number): number {
  return Math.min(75, Math.max(8, Math.round(6 + totalQuantity * 0.18 + 2.5)));
}

export async function seedCustomCases(
  prisma: ScenarioPrisma,
  baseDate: string,
  locationIds: Record<string, string>,
  specs: readonly CustomCaseSpec[],
): Promise<void> {
  for (const s of specs) {
    const status = s.status ?? 'ready';
    if (s.storageCode === null && status !== 'blocked') {
      throw new Error(`[scenario] ${s.weBelegNo}: only blocked cases may lack a Lagerplatz`);
    }
    const bookingDate = offsetDate(baseDate, -(s.bookingOffsetDays ?? 0));
    const estimatedMinutes = s.estimatedMinutes ?? defaultMinutes(s.totalQuantity);
    const externalRef =
      `dev-seed:${s.weBelegNo}` + (s.externalRefSuffix ? `:${s.externalRefSuffix}` : '');
    const caseData = {
      source: 'prohandel_api' as const,
      externalRef,
      deliveryNoteNo:
        s.deliveryNoteNo === undefined ? `LS-${s.weBelegNo.replace(/\D/g, '')}` : s.deliveryNoteNo,
      bookingDate,
      weDate: bookingDate,
      branchNo: '001',
      primaryShopAreaNo: s.shopAreaNo ?? '21',
      primaryShopNo: s.shopAreaNo ?? '21',
      primaryFloor: s.floor ?? 'EG',
      storageLocationId:
        s.storageCode === null ? null : requireId(locationIds, s.storageCode, 'location'),
      section: s.section ?? null,
      goodsTypeText: s.goodsTypeText === undefined ? ('Vororder' as const) : s.goodsTypeText,
      priorityFlags: s.priorityFlags ?? [],
      catManDate: null,
      loadPlanDate:
        s.loadPlanOffsetDays === undefined || s.loadPlanOffsetDays === null
          ? null
          : offsetDate(baseDate, s.loadPlanOffsetDays),
      totalQuantity: s.totalQuantity,
      inboundCartonCount: Math.max(1, Math.ceil(s.totalQuantity / 25)),
      status,
      missingFields: s.missingFields ?? [],
      effortPoints: round2(estimatedMinutes / 2.2),
      estimatedMinutes,
      deliverySourceGroupKey: s.deliverySourceGroupKey ?? null,
      deliverySourceGroupSize: s.deliverySourceGroupSize ?? null,
      deliveryGroupReleased: s.deliveryGroupReleased ?? false,
      forwardedTo: s.forwardedTo ?? null,
      attentionFlag: s.attentionNote !== undefined,
      attentionNote: s.attentionNote ?? null,
    };
    await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: s.weBelegNo },
      update: { ...caseData, assignedBundleId: null },
      create: { weBelegNo: s.weBelegNo, ...caseData },
    });
  }
}

// --- Explicit detail aggregate (positions + SKU sizes + one box) ----------------
// For cases whose POSITIONS matter (B12 Koffer-WGR, B13 Online-Größen). Cases built
// here get the externalRef prefix `dev-seed:` too, but scenarios that use this
// helper simply must not ALSO run `seedCaseDetails` afterwards (it would overwrite
// the explicit sizes with its generic 38/40 pair).

export interface CustomPositionSpec {
  wgr: string;
  /** Gelieferte Größen — je Größe eine EAN/SKU-Zeile. */
  sizes: readonly string[];
  onlineRelevant?: boolean;
}

export async function seedCustomDetail(
  prisma: ScenarioPrisma,
  weBelegNo: string,
  positions: readonly CustomPositionSpec[],
): Promise<void> {
  const gcase = await prisma.goodsReceiptCase.findUnique({ where: { weBelegNo } });
  if (!gcase) throw new Error(`[scenario] seedCustomDetail: unknown case ${weBelegNo}`);

  const headerData = {
    priceLabelPrintRequired: true,
    goodsReceiptCheckMode: 'percentage_check' as const,
    goodsReceiptCheckPercentage: 20,
    inspectionLevelCode: 'p20' as const,
    boxLabelRequired: true,
    zstRequired: true,
  };
  await prisma.workInstructionHeader.upsert({
    where: { caseId: gcase.id },
    update: headerData,
    create: { caseId: gcase.id, ...headerData },
  });

  await prisma.receiptPosition.deleteMany({
    where: { caseId: gcase.id, positionNo: { gt: positions.length } },
  });
  const qtyPerPosition = Math.max(1, Math.floor(gcase.totalQuantity / positions.length));
  const positionIds: string[] = [];
  for (const [idx, p] of positions.entries()) {
    const position = await prisma.receiptPosition.upsert({
      where: { position_case_no: { caseId: gcase.id, positionNo: idx + 1 } },
      update: { wgr: p.wgr, onlineRelevant: p.onlineRelevant ?? false },
      create: {
        caseId: gcase.id,
        positionNo: idx + 1,
        wgr: p.wgr,
        supplierArticleNo: `ART-${p.wgr}-${idx + 1}`,
        supplierColor: 'schwarz',
        branchNo: gcase.branchNo,
        shopNo: gcase.primaryShopAreaNo ?? '21',
        floor: gcase.primaryFloor ?? 'EG',
        catMan: false,
        onlineRelevant: p.onlineRelevant ?? false,
      },
    });
    positionIds.push(position.id);
    // Stale SKU lines from a previous shape would corrupt the delivered-size set.
    await prisma.receiptSkuLine.deleteMany({
      where: { receiptPositionId: position.id, size: { notIn: [...p.sizes] } },
    });
    const perSize = Math.max(1, Math.floor(qtyPerPosition / p.sizes.length));
    for (const [sizeIdx, size] of p.sizes.entries()) {
      const ean = `429${p.wgr}${idx + 1}${sizeIdx}`.slice(0, 13);
      await prisma.receiptSkuLine.upsert({
        where: { sku_position_ean_size: { receiptPositionId: position.id, ean, size } },
        update: { expectedQuantity: perSize },
        create: {
          receiptPositionId: position.id,
          ean,
          size,
          expectedQuantity: perSize,
          ekPrice: 15,
          vkPrice: 36,
          vkLabelPrice: 36,
        },
      });
    }
  }

  await prisma.transportBox.deleteMany({ where: { caseId: gcase.id } });
  await prisma.transportBox.create({
    data: {
      caseId: gcase.id,
      boxNo: 1,
      branchNo: gcase.branchNo,
      shopAreaNo: gcase.primaryShopAreaNo ?? '21',
      shopNo: gcase.primaryShopAreaNo ?? '21',
      floor: gcase.primaryFloor ?? 'EG',
      plannedQuantity: gcase.totalQuantity,
      positionIds,
      goodsType: null,
      goodsTypeText: gcase.goodsTypeText,
    },
  });
}

// --- Vortages-Bündel (Fortsetzung C6 / Folgetag) --------------------------------
// Creates yesterday's bundle for one employee and links the given cases to it —
// the precondition for the Monster-Beleg continuation rules (kein neues Starter-
// Pack, Self-Pull → 'continuation'). resetCaseGraph wipes bundles on every load,
// so plain creates stay deterministic.

export async function seedCarryoverBundle(
  prisma: ScenarioPrisma,
  baseDate: string,
  employeeId: string,
  weBelegNos: readonly string[],
  dayOffset = -1,
): Promise<void> {
  const cases = await prisma.goodsReceiptCase.findMany({
    where: { weBelegNo: { in: [...weBelegNos] } },
    select: { id: true, estimatedMinutes: true, effortPoints: true },
  });
  if (cases.length !== weBelegNos.length) {
    throw new Error(`[scenario] seedCarryoverBundle: missing cases (${weBelegNos.join(', ')})`);
  }
  const bundle = await prisma.assignmentBundle.create({
    data: {
      employeeId,
      date: offsetDate(baseDate, dayOffset),
      plannedEffortMinutes: round2(cases.reduce((s, c) => s + c.estimatedMinutes, 0)),
      effortPoints: round2(cases.reduce((s, c) => s + c.effortPoints, 0)),
      status: 'active',
      createdBy: 'system',
    },
  });
  for (const [index, c] of cases.entries()) {
    await prisma.assignmentItem.create({
      data: { bundleId: bundle.id, caseId: c.id, sequence: index },
    });
  }
  await prisma.goodsReceiptCase.updateMany({
    where: { id: { in: cases.map((c) => c.id) } },
    data: { assignedBundleId: bundle.id },
  });
}

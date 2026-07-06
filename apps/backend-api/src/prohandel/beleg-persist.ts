import type { Prisma, PrismaClient } from '@prisma/client';
import type { GeneratedBeleg } from './beleg-generator.js';

/**
 * Persist ONE generierten Mock-ProHandel-Beleg (Kopf + Arbeitsanweisung + Positionen +
 * EAN/Größen-Zeilen + Transportboxen je Ziel). Gemeinsame Senke für den Connector-Pull
 * und den DB-Seed, damit beide exakt dieselbe Datenform erzeugen. Idempotent über die
 * natürlichen Schlüssel (weBelegNo, [caseId, positionNo], [positionId, ean, size]).
 */

type Db = Prisma.TransactionClient | PrismaClient;

/** Prüfstufe → abgeleiteter CheckMode + Prozentsatz (Header bleibt konsistent). */
function checkModeFromInspectionLevel(code: GeneratedBeleg['inspectionLevelCode']): {
  goodsReceiptCheckMode: 'quantity_only' | 'percentage_check' | 'full_check';
  goodsReceiptCheckPercentage: number | null;
} {
  switch (code) {
    case 'none':
      return { goodsReceiptCheckMode: 'quantity_only', goodsReceiptCheckPercentage: null };
    case 'p10':
      return { goodsReceiptCheckMode: 'percentage_check', goodsReceiptCheckPercentage: 10 };
    case 'p20':
      return { goodsReceiptCheckMode: 'percentage_check', goodsReceiptCheckPercentage: 20 };
    case 'full':
      return { goodsReceiptCheckMode: 'full_check', goodsReceiptCheckPercentage: 100 };
  }
}

function asDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/**
 * Intake-Gate (Teamlead-Feedback D1): Pflichtfelder, ohne die ein Beleg NICHT
 * verteilbar ist. Fehlt eines, wird der Beleg `blocked` angelegt („zurück an
 * Bucher") und erst nach Vervollständigung freigegeben.
 */
export function missingIntakeFields(beleg: {
  storageCode: string | null;
  deliveryNoteNo: string | null;
}): string[] {
  const missing: string[] = [];
  if (!beleg.storageCode) missing.push('Lagerplatz');
  if (!beleg.deliveryNoteNo) missing.push('Lieferschein');
  return missing;
}

export interface PersistedBeleg {
  id: string;
  /** True when the intake gate blocked the Beleg (zurück an Bucher). */
  blocked: boolean;
  missingFields: string[];
}

export async function persistGeneratedBeleg(
  db: Db,
  beleg: GeneratedBeleg,
  locationIdByCode: ReadonlyMap<string, string>,
): Promise<PersistedBeleg> {
  const missingFields = missingIntakeFields(beleg);
  const blocked = missingFields.length > 0;
  const storageLocationId = beleg.storageCode ? locationIdByCode.get(beleg.storageCode) : null;
  if (beleg.storageCode && storageLocationId === undefined) {
    throw new Error(`[prohandel-mock] unknown storage code "${beleg.storageCode}"`);
  }

  const caseData = {
    source: 'prohandel_api' as const,
    externalRef: beleg.externalRef,
    deliveryNoteNo: beleg.deliveryNoteNo,
    deliverySourceGroupKey: beleg.deliverySourceGroupKey,
    deliverySourceGroupSize: beleg.deliverySourceGroupSize,
    bookingDate: asDate(beleg.bookingDate),
    weDate: asDate(beleg.bookingDate),
    branchNo: beleg.branchNo,
    primaryShopAreaNo: beleg.primaryShopAreaNo,
    primaryShopNo: beleg.primaryShopNo,
    primaryFloor: beleg.primaryFloor,
    storageLocationId: storageLocationId ?? null,
    section: beleg.section,
    goodsTypeText: beleg.goodsTypeText,
    priorityFlags: beleg.priorityFlags,
    totalQuantity: beleg.totalQuantity,
    inboundCartonCount: beleg.inboundCartonCount,
    // Intake-Gate (D1): unvollständige Buchungen werden NIE ready.
    status: blocked ? ('blocked' as const) : ('ready' as const),
    missingFields,
    // Interne Aufwandsschätzung (nur verdeckte KPI-Hilfe, kein Steuerungsmodell).
    effortPoints: Math.round(beleg.totalQuantity * 0.25 * 100) / 100,
    estimatedMinutes: Math.round(beleg.totalQuantity * 0.25 * 100) / 100,
  };

  const created = await db.goodsReceiptCase.upsert({
    where: { weBelegNo: beleg.weBelegNo },
    update: caseData,
    create: { weBelegNo: beleg.weBelegNo, ...caseData },
  });

  const check = checkModeFromInspectionLevel(beleg.inspectionLevelCode);
  const header = {
    priceLabelPrintRequired: beleg.positions.some((p) => p.instruction.priceLabelRequired),
    sortByArticleColorSizeRequired: beleg.positions.length > 1,
    ...check,
    inspectionLevelCode: beleg.inspectionLevelCode,
    boxLabelRequired: true,
    zstRequired: true,
  };
  await db.workInstructionHeader.upsert({
    where: { caseId: created.id },
    update: header,
    create: { caseId: created.id, ...header },
  });

  for (const p of beleg.positions) {
    const positionData = {
      wgr: p.wgr,
      supplierArticleNo: p.supplierArticleNo,
      supplierColor: p.supplierColor,
      season: p.season,
      nosFlag: p.nosFlag,
      branchNo: beleg.branchNo,
      shopNo: p.shopNo,
      floor: p.floor,
      catMan: p.catMan,
      onlineRelevant: p.onlineRelevant,
    };
    const position = await db.receiptPosition.upsert({
      where: { position_case_no: { caseId: created.id, positionNo: p.positionNo } },
      update: positionData,
      create: { caseId: created.id, positionNo: p.positionNo, ...positionData },
    });

    const instruction = {
      priceLabelRequired: p.instruction.priceLabelRequired,
      priceLabelAttachRequired: p.instruction.priceLabelAttachRequired,
      securityRequired: p.instruction.securityRequired,
      securityTypeCode: p.instruction.securityTypeCode,
      onlineHandlingRequired: p.instruction.onlineHandlingRequired,
    };
    await db.positionInstruction.upsert({
      where: { positionId: position.id },
      update: instruction,
      create: { positionId: position.id, ...instruction },
    });

    for (const line of p.skuLines) {
      const lineData = {
        expectedQuantity: line.expectedQuantity,
        ekPrice: line.ekPrice,
        vkPrice: line.vkPrice,
        vkLabelPrice: line.vkLabelPrice,
      };
      await db.receiptSkuLine.upsert({
        where: {
          sku_position_ean_size: {
            receiptPositionId: position.id,
            ean: line.ean,
            size: line.size,
          },
        },
        update: lineData,
        create: { receiptPositionId: position.id, ean: line.ean, size: line.size, ...lineData },
      });
    }
  }

  // Transportboxen je Ziel (Shop + Etage) — bildet Mehr-Shop-Belege vollständig ab (A7).
  await db.transportBox.deleteMany({ where: { caseId: created.id } });
  const qtyByDestination = new Map<string, { shopNo: string; floor: string; qty: number }>();
  for (const p of beleg.positions) {
    const key = `${p.shopNo}|${p.floor}`;
    const posQty = p.skuLines.reduce((sum, l) => sum + l.expectedQuantity, 0);
    const entry = qtyByDestination.get(key);
    if (entry) entry.qty += posQty;
    else qtyByDestination.set(key, { shopNo: p.shopNo, floor: p.floor, qty: posQty });
  }
  let boxNo = 0;
  for (const dest of qtyByDestination.values()) {
    boxNo += 1;
    await db.transportBox.create({
      data: {
        caseId: created.id,
        boxNo,
        branchNo: beleg.branchNo,
        shopAreaNo: beleg.primaryShopAreaNo,
        shopNo: dest.shopNo,
        floor: dest.floor,
        plannedQuantity: dest.qty,
      },
    });
  }

  return { id: created.id, blocked, missingFields };
}

// Case-graph building blocks (extracted from the former monolithic prisma/seed.ts).
// Scenarios compose these AFTER `seedMasterData`: the generated ready pool, the
// per-case detail aggregate (header/positions/SKU lines/boxes), the lifecycle
// fixtures for the Belege scopes, the mock-ProHandel batch and the Intake-Gate /
// Lieferungs-Hold fixtures. Deterministic and idempotent by natural keys.
import type { BoxGoodsType, GoodsTypeText, PriorityFlag } from '@prisma/client';
import {
  LABEL_PRINT_VARIANT_ORDER,
  labelPrintRequired,
  type LabelPrintVariant,
} from '@paket/domain-types';
import { generateBelege } from '../../prohandel/beleg-generator.js';
import { persistGeneratedBeleg } from '../../prohandel/beleg-persist.js';
import { LOCATIONS, type GeneratedCase } from './seed-data.js';
import { asDate, asTime, offsetDate, requireId, round2 } from './lib.js';
import type { ScenarioPrisma } from './types.js';

// --- Goods receipt cases (the ready pool the engine bundles) -----------------
// Generated from the real historical volume profile for the chosen scenario.
// Cases arrive in delivery runs (shared deliveryNoteNo + consecutive weBelegNo)
// so the Pkt.1 delivery-grouping fires and the board shows "Lieferung ×n" clusters.

export async function seedCases(
  prisma: ScenarioPrisma,
  baseDate: string,
  locationIds: Record<string, string>,
  cases: GeneratedCase[],
): Promise<void> {
  for (const c of cases) {
    const storageLocationId = requireId(locationIds, c.storageCode, 'location');
    const bookingDate = offsetDate(baseDate, -c.bookingOffsetDays);
    const caseData = {
      source: 'prohandel_api' as const,
      externalRef: `dev-seed:${c.weBelegNo}`,
      deliveryNoteNo: c.deliveryNoteNo,
      bookingDate,
      weDate: bookingDate,
      branchNo: c.branchNo,
      primaryShopAreaNo: c.shopAreaNo,
      primaryShopNo: c.shopAreaNo,
      primaryFloor: c.floor,
      storageLocationId,
      section: c.section,
      goodsTypeText: c.goodsTypeText,
      priorityFlags: c.priorityFlags,
      catManDate: c.catManDue ? asDate(baseDate) : null,
      loadPlanDate: c.loadPlanOffsetDays === null ? null : offsetDate(baseDate, c.loadPlanOffsetDays),
      totalQuantity: c.totalQuantity,
      // A6: Kartonanzahl der Anlieferung (~25 Teile je Karton).
      inboundCartonCount: Math.max(1, Math.ceil(c.totalQuantity / 25)),
      status: 'ready' as const,
      effortPoints: c.effortPoints,
      estimatedMinutes: c.estimatedMinutes,
    };

    await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: c.weBelegNo },
      // Re-runs reset the case back into the ready pool (clears any prior bundle
      // link from a previous recalculate) so the load stays deterministic.
      update: { ...caseData, assignedBundleId: null },
      create: { weBelegNo: c.weBelegNo, ...caseData },
    });
  }
}

// --- Case details (header + positions + box targets for the PWA aggregate) ---
// The /api/me/cases/:id/aggregate endpoint (§14.2) needs a non-empty aggregate,
// and a FULL ZST-Teilabschluss requires every box verplombt / position confirmed,
// which is impossible with zero boxes/positions. So EVERY case gets a work-
// instruction header, 1+ receipt positions and 1+ transport boxes whose planned
// quantities sum to totalQuantity. Idempotent via natural keys: WorkInstructionHeader
// (PK caseId), ReceiptPosition (@@unique [caseId, positionNo]), TransportBox
// (@@unique [caseId, boxNo]). Detail params (check mode, position count) come from
// the generated case spec; lifecycle cases without a spec fall back to defaults.

/** Split a total into 1-2 positive box quantities (deterministic from total). */
function splitQuantity(total: number): number[] {
  if (total <= 1) return [Math.max(total, 1)];
  const first = Math.ceil(total / 2);
  return [first, total - first];
}

/** Beleg-Kopf-Warenart → Boxzettel-Warenart (Box trägt die Warenart ihres Belegs). */
function boxGoodsTypeFromCase(text: GoodsTypeText | null): BoxGoodsType | null {
  switch (text) {
    case 'Vororder': return 'vororder';
    case 'Nachorder': return 'nachorder';
    case 'Sonderposten': return 'sopo';
    case 'NOS': case 'NOOS': return 'nos';
    case 'Extrabestellung': return 'extrabestellung';
    case 'NOS_Nachorder': return 'nos_nachorder';
    case 'Prio': return 'prio';
    default: return null;
  }
}

interface DetailParams {
  checkMode: 'quantity_only' | 'percentage_check' | 'full_check';
  checkPercentage: number | null;
  positionCount: number;
}

function detailParamsFor(spec: GeneratedCase | undefined, totalQuantity: number): DetailParams {
  if (spec) {
    return { checkMode: spec.checkMode, checkPercentage: spec.checkPercentage, positionCount: spec.positionCount };
  }
  // Lifecycle/fallback default: 2 positions for larger cases, percentage check.
  return {
    checkMode: 'percentage_check',
    checkPercentage: 20,
    positionCount: totalQuantity >= 24 ? 2 : 1,
  };
}

/** A5: Prüfstufe aus dem Katalog, abgeleitet aus dem Prüfmodus des Belegs. */
function inspectionLevelFor(params: DetailParams): 'none' | 'p10' | 'p20' | 'full' {
  if (params.checkMode === 'quantity_only') return 'none';
  if (params.checkMode === 'full_check') return 'full';
  return params.checkPercentage === 10 ? 'p10' : 'p20';
}

export async function seedCaseDetails(
  prisma: ScenarioPrisma,
  specByWeBelegNo: Map<string, GeneratedCase>,
): Promise<void> {
  // Cover every case that benefits from a detail aggregate: the ready pool (so any
  // engine-assigned case is completable in the PWA) AND the terminal/issue
  // lifecycle cases (so their Belegdetail Positionen/Boxen tabs are populated, not
  // empty). Cancelled cases get no detail — there is nothing to show.
  const cases = await prisma.goodsReceiptCase.findMany({
    where: {
      // Only the handcrafted fixtures — generated mock-ProHandel Belege carry their
      // own richer positions/boxes and must not be clobbered on re-runs.
      externalRef: { startsWith: 'dev-seed:' },
      status: {
        in: [
          'needs_review',
          'ready',
          'parked',
          'assigned',
          'in_progress',
          'completed',
          'zst_done',
          'issue_open',
          'problem_resolved',
        ],
      },
    },
  });

  for (const c of cases) {
    const params = detailParamsFor(specByWeBelegNo.get(c.weBelegNo), c.totalQuantity);
    // Positions carry a destination: Filiale / Shopbereich / Etage. Most Belege ship
    // to ONE Etage → one Transportbox. A deterministic subset puts a second position
    // on another Etage to demo the real split (one box per Shopbereich/Shop/Etage).
    const positionCount = Math.min(params.positionCount, Math.max(1, Math.floor(c.totalQuantity / 4) || 1));
    // B3 + Kundenfeedback 03.08.2026: die Etikett-Druckvariante hängt an der POSITION
    // (mit Preis / DigiTag ohne Preis / kein Etikett); der Kopf-Flag ist nur noch ihre
    // Zusammenfassung. Deterministische Mischung über WE-Nr × Positions-Index, damit im
    // Seed alle drei Varianten UND echte Misch-Belege vorkommen — sonst trüge die
    // Etiketten-Anzeige am Bündel-Home keine Information mehr.
    const caseDigit = Number(c.weBelegNo.replace(/\D/g, '').slice(-1));
    const variantFor = (positionNo: number): LabelPrintVariant =>
      LABEL_PRINT_VARIANT_ORDER[(caseDigit + positionNo) % LABEL_PRINT_VARIANT_ORDER.length]!;
    const headerData = {
      priceLabelPrintRequired: Array.from({ length: positionCount }, (_, idx) =>
        variantFor(idx + 1),
      ).some(labelPrintRequired),
      goodsReceiptCheckMode: params.checkMode,
      goodsReceiptCheckPercentage: params.checkPercentage,
      // A5: Prüfstufe aus dem Katalog, konsistent zum Prüfmodus des Belegs.
      inspectionLevelCode: inspectionLevelFor(params),
      boxLabelRequired: true,
      zstRequired: true,
    };
    await prisma.workInstructionHeader.upsert({
      where: { caseId: c.id },
      update: headerData,
      create: { caseId: c.id, ...headerData },
    });

    const splitAcrossEtagen = positionCount >= 2 && c.totalQuantity % 2 === 0;
    const secondQty = Math.floor(c.totalQuantity / positionCount);
    // WGRs kommen aus dem gesäten WGR-Katalog (A2), damit Katalog-Beschreibung und
    // A8-Größen-Präferenzen auf echten Positionen greifen.
    const POSITION_WGRS = ['218110', '111130', '214520', '312400', '415210'] as const;
    // A8: Jeder zweite Beleg führt eine online-relevante Position 1. Deren WGR 218110
    // hat eine Größen-Präferenz (38 bevorzugt, 40 Ausweich), und genau 38/40 werden
    // geliefert — die PWA zeigt damit je Größe einen grünen und einen roten Chip.
    // Nicht auf jedem Beleg, sonst wäre in der Demo jeder Artikel ein Onlineartikel.
    const onlineDemoCase = Number(c.weBelegNo.replace(/\D/g, '').slice(-1)) % 2 === 0;
    const posMeta = Array.from({ length: positionCount }, (_, idx) => ({
      positionNo: idx + 1,
      wgr: POSITION_WGRS[idx] ?? '218110',
      supplierArticleNo: `ART-${String(idx + 1).padStart(3, '0')}`,
      supplierColor: ['schwarz', 'blau', 'rot', 'grün', 'weiß'][idx] ?? 'schwarz',
      floor: idx === 0 ? c.primaryFloor ?? 'EG' : splitAcrossEtagen ? '1.OG' : c.primaryFloor ?? 'EG',
      qty: idx === 0 ? c.totalQuantity - secondQty * (positionCount - 1) : secondQty,
      // A4: Position 1 trägt CatMan + Sicherungstyp-Piktogramm, Folgepositionen nicht.
      catMan: idx === 0,
      securityTypeCode: idx === 0 ? 'hard-tag' : null,
      onlineRelevant: idx === 0 && onlineDemoCase,
    }));

    // Ältere Seed-Generationen hinterlassen überzählige Positionen (upsert löscht nie)
    // — wegräumen, damit Beleg, Boxen und Warenart konsistent sind.
    await prisma.receiptPosition.deleteMany({
      where: { caseId: c.id, positionNo: { gt: posMeta.length } },
    });
    const positionIdsByFloor = new Map<string, string[]>();
    for (const p of posMeta) {
      // CatMan-Termin (Kundenfeedback 14.07.2026): ein echter, deterministischer
      // Termin ein paar Tage nach dem Buchungstag — NICHT der (oft leere) Load-Plan-Tag,
      // sonst zeigt die PWA-Positionszeile ein leeres CatMan-Datum.
      const catManDate = p.catMan
        ? offsetDate(
            c.bookingDate.toISOString().slice(0, 10),
            5 + (Number(c.weBelegNo.replace(/\D/g, '').slice(-2)) % 18),
          )
        : null;
      const position = await prisma.receiptPosition.upsert({
        where: { position_case_no: { caseId: c.id, positionNo: p.positionNo } },
        update: {
          wgr: p.wgr, supplierArticleNo: p.supplierArticleNo, supplierColor: p.supplierColor,
          floor: p.floor, catMan: p.catMan, catManDate, orderNo: `ORD-${c.weBelegNo}-${p.positionNo}`,
          shopNo: '21', hShopNo: '21', branchNo: '001',
          onlineRelevant: p.onlineRelevant,
        },
        create: {
          caseId: c.id,
          positionNo: p.positionNo,
          wgr: p.wgr,
          supplierArticleNo: p.supplierArticleNo,
          supplierColor: p.supplierColor,
          branchNo: c.branchNo,
          shopNo: c.primaryShopAreaNo ?? '21',
          hShopNo: c.primaryShopAreaNo ?? '21',
          floor: p.floor,
          catMan: p.catMan,
          catManDate,
          orderNo: `ORD-${c.weBelegNo}-${p.positionNo}`,
          onlineRelevant: p.onlineRelevant,
        },
      });

      positionIdsByFloor.set(p.floor, [...(positionIdsByFloor.get(p.floor) ?? []), position.id]);

      // Positionsanweisung inkl. Sicherungstyp-Piktogramm (A4) und Etikett-Druckvariante.
      const labelPrintVariant = variantFor(p.positionNo);
      const instruction = {
        labelPrintVariant,
        // Anbringen setzt ein gedrucktes Etikett voraus — ohne Etikett kein Anbringen.
        priceLabelAttachRequired: p.positionNo === 1 && labelPrintRequired(labelPrintVariant),
        securityRequired: p.securityTypeCode !== null,
        securityTypeCode: p.securityTypeCode,
        onlineHandlingRequired: false,
      };
      await prisma.positionInstruction.upsert({
        where: { positionId: position.id },
        update: instruction,
        create: { positionId: position.id, ...instruction },
      });

      // Two EAN/size lines per position so the Belegdetail "Positionen" SKU table
      // (EAN · Größe · Soll · Ist · Status) is populated; Soll splits this position's
      // quantity across the lines, Ist stays open (null) until confirmed.
      const skuQuantities = splitQuantity(Math.max(2, p.qty));
      const sizes = ['38', '40'];
      for (const [skuIndex, expectedQuantity] of skuQuantities.entries()) {
        const size = sizes[skuIndex] ?? String(40 + skuIndex * 2);
        // Beleg-Nummern sind gepunktet („3.540.001") — nur Ziffern in die EAN.
        const ean = `40123${p.positionNo}${skuIndex}${c.weBelegNo.replace(/\D/g, '').slice(-5)}`;
        // A1: EK/VK/VK-Etikett je EAN/Größen-Zeile — wie auf dem WE-Beleg-Papier.
        const ekPrice = 12.5 + p.positionNo * 2;
        const vkPrice = round2(ekPrice * 2.4);
        const prices = { ekPrice, vkPrice, vkLabelPrice: vkPrice };
        await prisma.receiptSkuLine.upsert({
          where: { sku_position_ean_size: { receiptPositionId: position.id, ean, size } },
          update: { expectedQuantity, ...prices },
          create: { receiptPositionId: position.id, ean, size, expectedQuantity, ...prices },
        });
      }
    }

    // Boxes BY DESTINATION, not by piece count (§ box label = Shopbereich/Shop/Etage):
    // one Transportbox per distinct Etage across the positions. Rebuilt each run so a
    // case that no longer splits drops its extra box. Quantities sum to totalQuantity
    // (the full-ZST gate). Single-destination Beleg → exactly one box.
    await prisma.transportBox.deleteMany({ where: { caseId: c.id } });
    const qtyByFloor = new Map<string, number>();
    for (const p of posMeta) {
      qtyByFloor.set(p.floor, (qtyByFloor.get(p.floor) ?? 0) + p.qty);
    }
    let boxNo = 0;
    for (const [floor, plannedQuantity] of qtyByFloor) {
      boxNo += 1;
      await prisma.transportBox.create({
        data: {
          caseId: c.id,
          boxNo,
          branchNo: c.branchNo,
          shopAreaNo: c.primaryShopAreaNo ?? '21',
          shopNo: c.primaryShopAreaNo ?? '21',
          floor,
          plannedQuantity,
          // Boxzettel vollständig: Positionen der Box + Warenart des Belegs (nie
          // nichtssagendes „Gemischt" ohne Aufschlüsselung).
          positionIds: positionIdsByFloor.get(floor) ?? [],
          goodsType: boxGoodsTypeFromCase(c.goodsTypeText),
          goodsTypeText: c.goodsTypeText,
        },
      });
    }
  }
}

// --- Lifecycle cases (populate the Belege scopes Abgeschlossen / Archiv) ------
// A handful of cases in terminal / completion / issue states so the §10.4 Belege
// view's scope switcher (Aktiv / Abgeschlossen heute / Archiv) and the Problemfälle
// lane are non-empty in dev. They are NOT status='ready', so the engine ignores them.

type LifecycleStatus =
  | 'needs_review'
  | 'parked'
  | 'in_progress'
  | 'completed'
  | 'zst_done'
  | 'cancelled'
  | 'issue_open'
  | 'problem_resolved';

export interface SeedLifecycleCase {
  weBelegNo: string;
  storageCode: string;
  section: number | null;
  goodsTypeText: 'Vororder' | 'Nachorder' | 'NOS' | 'Sonderposten' | 'Prio';
  totalQuantity: number;
  effortPoints: number;
  estimatedMinutes: number;
  status: LifecycleStatus;
  employeeNo: string;
  completedQuantity?: number;
  completedAt?: string;
  exportedAt?: string;
  /**
   * Offenes Problem des Belegs: manuell mit Katalog-Grund (`reasonId` aus dem
   * Migrations-Startkatalog) oder implizit als Mengen-Abweichung (`deviationQty`).
   */
  issue?: {
    reasonId?: 'pr_wrong_color' | 'pr_damaged_goods' | 'pr_other';
    kind?: 'under_delivery' | 'over_delivery';
    deviationQty?: number;
    description: string;
  };
  /** A7 TL-Topf: „Besondere Aufmerksamkeit"-Flag mit Notiz (Bucherinnen-Inlet mock). */
  attentionNote?: string;
  /** C5 Digitale Ablage: Weiterleitungs-Empfänger (retourenabteilung|lieferscheinbucher). */
  forwardedTo?: 'retourenabteilung' | 'lieferscheinbucher';
}

/** True for completion states — these get completedAt + the DocuWare archive link (A6). */
function isCompletionStatus(status: LifecycleStatus): boolean {
  return status === 'completed' || status === 'zst_done';
}

/** Mock DocuWare-Langzeitarchiv link (A6) for a completed Beleg. */
function docuWareUrlFor(weBelegNo: string): string {
  return `https://docuware.example.com/lt-archiv/${weBelegNo}`;
}

const LIFECYCLE_CASES: SeedLifecycleCase[] = [
  {
    weBelegNo: 'WE-2026-000201', storageCode: 'R7', section: 2, goodsTypeText: 'Vororder',
    totalQuantity: 60, effortPoints: 14, estimatedMinutes: 28, status: 'completed',
    employeeNo: 'ma-101', completedQuantity: 60, completedAt: '14:32',
  },
  {
    weBelegNo: 'WE-2026-000202', storageCode: 'R19', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 100, effortPoints: 20, estimatedMinutes: 40, status: 'problem_resolved',
    employeeNo: 'ma-102', completedQuantity: 40, completedAt: '14:05',
  },
  {
    weBelegNo: 'WE-2026-000203', storageCode: 'R27', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 45, effortPoints: 11, estimatedMinutes: 22, status: 'zst_done',
    employeeNo: 'ma-101', completedQuantity: 45, completedAt: '13:40', exportedAt: '17:00',
  },
  {
    weBelegNo: 'WE-2026-000204', storageCode: 'PB-4', section: 4, goodsTypeText: 'Sonderposten',
    totalQuantity: 18, effortPoints: 5, estimatedMinutes: 12, status: 'cancelled',
    employeeNo: 'ma-103',
  },
  {
    weBelegNo: 'WE-2026-000205', storageCode: 'D-3', section: 8, goodsTypeText: 'Prio',
    totalQuantity: 33, effortPoints: 8, estimatedMinutes: 20, status: 'issue_open',
    employeeNo: 'ma-103',
    issue: { reasonId: 'pr_wrong_color', description: 'Farbe weicht von Arbeitsanweisung ab' },
  },
  {
    weBelegNo: 'WE-2026-000206', storageCode: 'R7', section: 7, goodsTypeText: 'NOS',
    totalQuantity: 28, effortPoints: 7, estimatedMinutes: 16, status: 'needs_review',
    employeeNo: 'ma-101',
    attentionNote: 'Bucherin: Preisangaben unklar — bitte vor Freigabe prüfen.',
  },
  {
    weBelegNo: 'WE-2026-000207', storageCode: 'R19', section: 4, goodsTypeText: 'Nachorder',
    totalQuantity: 52, effortPoints: 12, estimatedMinutes: 26, status: 'parked',
    employeeNo: 'ma-102',
    attentionNote: 'Bucherin: Lieferant hat Nachlieferung angekündigt.',
  },
  {
    weBelegNo: 'WE-2026-000208', storageCode: 'R27', section: 1, goodsTypeText: 'Vororder',
    totalQuantity: 41, effortPoints: 10, estimatedMinutes: 22, status: 'in_progress',
    employeeNo: 'ma-103',
  },
  // C5 Digitale Ablage: ein weitergeleiteter Beleg (parked, damit die Engine ihn
  // ignoriert) — landet in der „weitergeleitet"-Lane, gruppiert nach Empfänger.
  {
    weBelegNo: 'WE-2026-000209', storageCode: 'PB-4', section: 3, goodsTypeText: 'Nachorder',
    totalQuantity: 22, effortPoints: 6, estimatedMinutes: 14, status: 'parked',
    employeeNo: 'ma-102',
    forwardedTo: 'retourenabteilung',
  },
];

export async function seedLifecycleCases(
  prisma: ScenarioPrisma,
  baseDate: string,
  locationIds: Record<string, string>,
  userIds: Record<string, string>,
  cases: readonly SeedLifecycleCase[] = LIFECYCLE_CASES,
): Promise<void> {
  for (const c of cases) {
    const storageLocationId = requireId(locationIds, c.storageCode, 'location');
    const employeeId = requireId(userIds, c.employeeNo, 'user');
    const caseData = {
      source: 'manual' as const,
      externalRef: `dev-seed:${c.weBelegNo}`,
      deliveryNoteNo: c.weBelegNo.replace('WE', 'LS'),
      bookingDate: asDate(baseDate),
      weDate: asDate(baseDate),
      branchNo: '001',
      primaryShopAreaNo: '21',
      primaryShopNo: '21',
      primaryFloor: 'EG',
      storageLocationId,
      section: c.section,
      goodsTypeText: c.goodsTypeText,
      priorityFlags: [] as PriorityFlag[],
      catManDate: null,
      totalQuantity: c.totalQuantity,
      inboundCartonCount: Math.max(1, Math.ceil(c.totalQuantity / 25)),
      status: c.status,
      effortPoints: c.effortPoints,
      estimatedMinutes: c.estimatedMinutes,
      // A6 Archiv: Abschlusszeitpunkt + DocuWare-Link für abgeschlossene Belege.
      completedAt:
        isCompletionStatus(c.status) && c.completedAt ? asTime(baseDate, c.completedAt) : null,
      docuWareUrl: isCompletionStatus(c.status) ? docuWareUrlFor(c.weBelegNo) : null,
      // A7 TL-Topf: Aufmerksamkeitsflag (Bucherinnen-Inlet mock).
      attentionFlag: c.attentionNote !== undefined,
      attentionNote: c.attentionNote ?? null,
      // C5 Digitale Ablage: Weiterleitung (status-neutral).
      forwardedTo: c.forwardedTo ?? null,
    };
    const gcase = await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: c.weBelegNo },
      update: { ...caseData, assignedBundleId: null },
      create: { weBelegNo: c.weBelegNo, ...caseData },
    });

    // ZST record for the completion-bearing states (drives the §15 KPI tile +
    // future Tagesjournal). exportedAt is set only once the case reached zst_done.
    if (c.completedQuantity !== undefined && c.completedAt) {
      await prisma.zstRecord.upsert({
        where: { idempotencyKey: `seed-zst:${c.weBelegNo}` },
        update: {
          completedQuantity: c.completedQuantity,
          effortPoints: c.effortPoints,
          completedAt: asTime(baseDate, c.completedAt),
          exportedAt: c.exportedAt ? asTime(baseDate, c.exportedAt) : null,
        },
        create: {
          idempotencyKey: `seed-zst:${c.weBelegNo}`,
          caseId: gcase.id,
          employeeId,
          completedQuantity: c.completedQuantity,
          effortPoints: c.effortPoints,
          startedAt: asTime(baseDate, '11:00'),
          completedAt: asTime(baseDate, c.completedAt),
          source: 'mobile_app',
          exportedAt: c.exportedAt ? asTime(baseDate, c.exportedAt) : null,
        },
      });
    }

  }
}

/**
 * Offene Probleme der Lifecycle-Fälle (Problemfälle lane) — als EIGENER Schritt
 * NACH `seedCaseDetails`: Probleme hängen an einer Position (Kundenfeedback
 * 14.07.2026), und die Positionen entstehen erst mit den Detail-Daten. Idempotent:
 * nur anlegen, wenn der Beleg noch kein offenes Problem hat.
 */
export async function seedLifecycleIssues(
  prisma: ScenarioPrisma,
  userIds: Record<string, string>,
  cases: readonly SeedLifecycleCase[] = LIFECYCLE_CASES,
): Promise<void> {
  for (const c of cases) {
    if (!c.issue) continue;
    const gcase = await prisma.goodsReceiptCase.findUnique({
      where: { weBelegNo: c.weBelegNo },
      select: { id: true },
    });
    if (!gcase) continue;
    const existing = await prisma.issue.findFirst({
      where: { caseId: gcase.id, status: 'open' },
    });
    if (existing) continue;
    const firstPosition = await prisma.receiptPosition.findFirst({
      where: { caseId: gcase.id },
      orderBy: { positionNo: 'asc' },
      select: { id: true },
    });
    const reason = c.issue.reasonId
      ? await prisma.problemReason.findUnique({ where: { id: c.issue.reasonId } })
      : null;
    const reporterId = requireId(userIds, c.employeeNo, 'user');
    const issue = await prisma.issue.create({
      data: {
        caseId: gcase.id,
        scope: 'position',
        scopeId: firstPosition?.id,
        employeeId: reporterId,
        kind: c.issue.kind ?? 'manual',
        reasonId: reason?.id,
        reasonLabel: reason?.label,
        deviationQty: c.issue.deviationQty,
        description: c.issue.description,
        status: 'open',
      },
    });
    // Erst-Meldung als erster Verlaufs-Eintrag (Instruktions-Loop 04.08.2026).
    const reporter = await prisma.user.findUnique({
      where: { id: reporterId },
      select: { displayName: true },
    });
    await prisma.issueMessage.create({
      data: {
        issueId: issue.id,
        authorId: reporterId,
        authorName: reporter?.displayName ?? 'Mitarbeiter',
        authorRole: 'employee',
        kind: 'meldung',
        text: c.issue.description,
      },
    });
  }
}

// --- Generated mock-ProHandel batch (A9) ---------------------------------------
// Same generator + persistence sink as the "Jetzt pullen" connector, so the pool
// carries every ERP field (prices, WGR, CatMan, Sicherungstyp, Prüfstufe, Kartons,
// Shops, Liefergruppen). Deterministic: fixed seed + fixed number range.

export async function seedGeneratedBelege(
  prisma: ScenarioPrisma,
  baseDate: string,
  locationIds: Record<string, string>,
): Promise<void> {
  const storageCodes = LOCATIONS.map((l) => l.code);
  const belege = generateBelege({
    seed: 42,
    count: 16,
    startNo: 300,
    bookingDate: baseDate,
    storageCodes,
  });
  const locationIdByCode = new Map(Object.entries(locationIds));
  for (const beleg of belege) {
    await persistGeneratedBeleg(prisma, beleg, locationIdByCode);
  }
}

// --- Intake-Gate + Lieferungs-Hold demo fixtures (D1/D2) ------------------------
// Zwei blockierte Belege („zurück an Bucher": ohne Lagerplatz bzw. ohne
// Lieferschein) und eine UNVOLLSTÄNDIGE bestätigte Lieferung (2 von 3 da) —
// deren Mitglieder hält die Engine zurück, bis der dritte Beleg gebucht ist
// oder der Teamlead „trotzdem bearbeiten" freigibt.

export async function seedIntakeGateFixtures(
  prisma: ScenarioPrisma,
  baseDate: string,
  locationIds: Record<string, string>,
): Promise<void> {
  const base = {
    source: 'prohandel_api' as const,
    bookingDate: asDate(baseDate),
    weDate: asDate(baseDate),
    branchNo: '001',
    primaryShopAreaNo: '22',
    primaryShopNo: '22',
    primaryFloor: 'EG',
    section: 2,
    goodsTypeText: 'Nachorder' as const,
    priorityFlags: [] as PriorityFlag[],
    totalQuantity: 30,
    inboundCartonCount: 2,
    effortPoints: 8,
    estimatedMinutes: 8,
  };

  // D1: ohne Lagerplatz.
  await prisma.goodsReceiptCase.upsert({
    where: { weBelegNo: 'WE-2026-000401' },
    update: { status: 'blocked', missingFields: ['Lagerplatz'], storageLocationId: null },
    create: {
      weBelegNo: 'WE-2026-000401',
      externalRef: 'prohandel:WE-2026-000401',
      deliveryNoteNo: 'LS-2026-000401',
      ...base,
      storageLocationId: null,
      status: 'blocked',
      missingFields: ['Lagerplatz'],
    },
  });
  // D1: ohne Lieferschein.
  await prisma.goodsReceiptCase.upsert({
    where: { weBelegNo: 'WE-2026-000402' },
    update: { status: 'blocked', missingFields: ['Lieferschein'], deliveryNoteNo: null },
    create: {
      weBelegNo: 'WE-2026-000402',
      externalRef: 'prohandel:WE-2026-000402',
      deliveryNoteNo: null,
      ...base,
      storageLocationId: requireId(locationIds, 'R7', 'location'),
      status: 'blocked',
      missingFields: ['Lieferschein'],
    },
  });
  // D2: bestätigte Lieferung „2 von 3" — Mitglieder ready, aber im Pool-Hold.
  for (const [i, no] of (['WE-2026-000403', 'WE-2026-000404'] as const).entries()) {
    await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: no },
      update: { status: 'ready', assignedBundleId: null, deliveryGroupReleased: false },
      create: {
        weBelegNo: no,
        externalRef: `prohandel:${no}`,
        deliveryNoteNo: 'LS-2026-000403',
        deliverySourceGroupKey: 'PH-LFG-403',
        deliverySourceGroupSize: 3,
        ...base,
        totalQuantity: 24 + i * 6,
        storageLocationId: requireId(locationIds, 'R19', 'location'),
        status: 'ready',
      },
    });
  }
}

// --- MA-108 Demo-Bündel (Vorführ-Mitarbeiter der Mitarbeiter-App) ---------------
// Der Quick-Login der PWA (VITE_DEMO_EMPLOYEE_NO, Railway) meldet Besucher als
// ma-108 an — dieser Mitarbeiter bekommt deshalb direkt beim Seed ein reiches,
// VOLL DETERMINISTISCHES Tages-Bündel, das jeden App-Zustand vorführbar macht:
// 4 Abhol-Stops über alle drei Bereiche (Regal/Palette/Hängebahn), eine
// Liefergruppe („Lieferung ×3": gleicher Lieferschein + fortlaufende WE-Nummern),
// alle vier Warenarten (Vororder/Nachorder/NOS/Extrabestellung), Etikettendruck-
// UND Digital-Etiketten-Belege, mehrere Positionen mit mehreren Größen-Zeilen
// (EAN · Größe · Soll · EK/VK/VK-Etikett), eine online-relevante Position
// (Rot/Grün 38/40), ein CatMan-Termin, plus die Sonderzustände Fertig
// (completed + ZST), Problem gemeldet (issue_open) und Geklärt (problem_resolved).
//
// Das Bündel trägt ZWEI Packs (Pull-Prinzip, siehe MA108_FOLLOW_UP_PACK_START_WE):
// Pack 1 (Stops R7 + R19) ist aktiv und damit das Einzige, was die Mitarbeiter-App
// zeigt; Pack 2 (PA-1 + Hängebahn) ist vorgeplant und erscheint dort erst, wenn
// Hakan es anfordert. Im DAMB-Board der Teamleitung sind beide zu sehen.
//
// Ordnung: NACH `seedCaseDetails` aufrufen — die Belege hier tragen ihre eigenen,
// expliziten Positionen/Größen und dürfen nicht vom generischen 38/40-Detail
// überschrieben werden. „Automatik neu berechnen" verhält sich systemkonform:
// das Bündel überlebt (es enthält begonnene/fertige Belege), aber die noch
// unbegonnenen `assigned`-Belege wandern zurück in den Pool und werden neu
// verplant — das Demo-Bündel ist für die Nutzung direkt nach „Szenario laden".

interface Ma108SkuSpec {
  ean: string;
  size: string;
  qty: number;
  ek: number;
  vk: number;
  /** VK-Etikett; weicht er vom VK ab, zeigt die PWA beide Spalten unterschiedlich. */
  vkLabel: number;
}

interface Ma108PositionSpec {
  wgr: string;
  supplierArticleNo: string;
  supplierColor: string;
  nosFlag?: boolean;
  season?: string;
  /**
   * CatMan-Termin: Tage relativ zu baseDate (deterministisch). Negativ = der
   * Termin liegt VOR dem Seed-Tag, der Beleg ist also überfällig — die PWA
   * markiert ihn rot („überfällig").
   */
  catManOffsetDays?: number;
  onlineRelevant?: boolean;
  securityTypeCode?: string | null;
  /**
   * Etikett-Druckvariante der Position (Kundenfeedback 03.08.2026). Ohne Angabe
   * gilt der klassische Fall „Etikett mit Preis" — genau der stille Standard,
   * den es vorher überall gab.
   */
  labelPrintVariant?: LabelPrintVariant;
  skuLines: Ma108SkuSpec[];
}

/**
 * Eine Einzel-Meldung des Demo-Bündels (Instruktions-Loop, Kundenfeedback
 * 04.08.2026): an einer konkreten Position verankert, mit optionalem Verlauf
 * Meldung → Instruktion → Rückmeldung → zweite Instruktion. Der Einzel-Status
 * ergibt sich aus dem Verlauf: letzte Instruktion unbeantwortet ⇒
 * instruction_sent, sonst open.
 */
interface Ma108IssueSpec {
  reasonId:
    | 'pr_wrong_article'
    | 'pr_wrong_color'
    | 'pr_damaged_goods'
    | 'pr_label_problem'
    | 'pr_other';
  /** 0-basierter Index der betroffenen Position des Belegs. */
  positionIndex: number;
  /** Erst-Meldung des MA (erster Verlaufs-Eintrag). */
  description: string;
  /** Instruktion der Teamleitung zu GENAU dieser Meldung. */
  instruction?: string;
  /** Rückmeldung des MA auf die Instruktion (öffnet die Meldung erneut). */
  rueckmeldung?: string;
  /** Zweite Instruktion der Teamleitung nach der Rückmeldung. */
  zweiteInstruktion?: string;
}

interface Ma108CaseSpec {
  weBelegNo: string;
  deliveryNoteNo: string;
  storageCode: string;
  goodsTypeText: GoodsTypeText;
  status: 'assigned' | 'completed' | 'issue_open' | 'problem_resolved';
  checkMode: 'quantity_only' | 'percentage_check' | 'full_check';
  checkPercentage?: 10 | 20;
  estimatedMinutes: number;
  /**
   * Kartons der Anlieferung. Explizit statt aus der Teile-Menge gerechnet: das
   * Demo-Bündel soll beide Zustände nebeneinander zeigen — Stop R7 trägt einen
   * Beleg mit 1 Karton (die App zeigt dann nichts) und zwei mit mehreren.
   */
  inboundCartonCount: number;
  positions: Ma108PositionSpec[];
  /** HH:mm — nur für completed (ZST-Record + Abschlusszeit). */
  completedAt?: string;
  /** Meldungen des Belegs (issue_open/problem_resolved-Demos). */
  issues?: Ma108IssueSpec[];
}

/** Die Bündel-Belege in Abhol-Reihenfolge (Stops nach Location-sequenceIndex). */
const MA108_CASES: Ma108CaseSpec[] = [
  // Stop 1 · R7 (Regal) — Liefergruppe ×3: gleicher Lieferschein LS-25-9108 +
  // fortlaufende WE-Nummern → beide Erkennungssignale (T2 note + T3 run) feuern.
  // Zugleich die drei CatMan-Zustände nebeneinander am selben Stop, direkt im
  // ersten (noch nicht geholten) Container der PWA sichtbar: überfällig (−3) ·
  // knapp (+1) · normal (+7).
  {
    weBelegNo: '9.108.021', deliveryNoteNo: 'LS-25-9108', storageCode: 'R7',
    goodsTypeText: 'Vororder', status: 'assigned',
    checkMode: 'percentage_check', checkPercentage: 20, estimatedMinutes: 18,
    inboundCartonCount: 1,
    positions: [
      {
        // CatMan-Fall „überfällig": Termin liegt VOR dem Seed-Tag → rote
        // Kennzeichnung samt „überfällig" in „Ware holen" und im Beleg-Kopf.
        wgr: '111130', supplierArticleNo: 'ART-2101', supplierColor: 'marine', season: 'HW 26',
        catManOffsetDays: -3,
        securityTypeCode: 'hard-tag',
        skuLines: [
          { ean: '4012345910211', size: 'S', qty: 6, ek: 11.9, vk: 29.99, vkLabel: 29.99 },
          { ean: '4012345910212', size: 'M', qty: 8, ek: 11.9, vk: 29.99, vkLabel: 29.99 },
        ],
      },
      {
        wgr: '214520', supplierArticleNo: 'ART-2102', supplierColor: 'grau',
        skuLines: [
          { ean: '4012345910221', size: 'L', qty: 5, ek: 14.5, vk: 34.99, vkLabel: 34.99 },
          { ean: '4012345910222', size: 'XL', qty: 5, ek: 14.5, vk: 34.99, vkLabel: 39.99 },
        ],
      },
    ],
  },
  {
    weBelegNo: '9.108.022', deliveryNoteNo: 'LS-25-9108', storageCode: 'R7',
    goodsTypeText: 'Vororder', status: 'assigned',
    checkMode: 'quantity_only', estimatedMinutes: 14,
    inboundCartonCount: 4,
    positions: [
      {
        // Ware kommt fertig ausgezeichnet — kein Etikettendruck, kein Gang zum Drucker.
        // CatMan-Fall „knapp": Termin schon morgen — Datum steht da, die
        // Bewertung „knapp" trifft der Mitarbeiter (keine Ampel-Logik in der UI).
        wgr: '312400', supplierArticleNo: 'ART-2110', supplierColor: 'oliv', season: 'HW 26',
        labelPrintVariant: 'kein_etikett',
        catManOffsetDays: 1,
        skuLines: [
          { ean: '4012345910231', size: '30/32', qty: 8, ek: 19.9, vk: 49.99, vkLabel: 49.99 },
          { ean: '4012345910232', size: '31/32', qty: 10, ek: 19.9, vk: 49.99, vkLabel: 49.99 },
          { ean: '4012345910233', size: '32/32', qty: 12, ek: 19.9, vk: 49.99, vkLabel: 49.99 },
        ],
      },
    ],
  },
  {
    weBelegNo: '9.108.023', deliveryNoteNo: 'LS-25-9108', storageCode: 'R7',
    goodsTypeText: 'Nachorder', status: 'assigned',
    checkMode: 'percentage_check', checkPercentage: 10, estimatedMinutes: 12,
    inboundCartonCount: 2,
    positions: [
      {
        // CatMan-Fall „normal": Termin eine Woche nach dem Seed-Tag → 📅-Chip
        // ohne Warnung. Folgepositionen ohne Termin bleiben bewusst leer (A4).
        wgr: '415210', supplierArticleNo: 'ART-2120', supplierColor: 'schwarz',
        catManOffsetDays: 7,
        skuLines: [
          { ean: '4012345910241', size: '40', qty: 9, ek: 24.5, vk: 59.99, vkLabel: 59.99 },
          { ean: '4012345910242', size: '42', qty: 9, ek: 24.5, vk: 59.99, vkLabel: 59.99 },
        ],
      },
    ],
  },
  // Stop 2 · R19 (Regal) — die Sonderzustände: Fertig / Problem gemeldet / Geklärt.
  {
    weBelegNo: '9.108.051', deliveryNoteNo: 'LS-25-9151', storageCode: 'R19',
    goodsTypeText: 'Vororder', status: 'completed',
    checkMode: 'percentage_check', checkPercentage: 20, estimatedMinutes: 10,
    inboundCartonCount: 1,
    completedAt: '11:40',
    positions: [
      {
        wgr: '218110', supplierArticleNo: 'ART-2151', supplierColor: 'weiß',
        skuLines: [
          { ean: '4012345910251', size: '38', qty: 7, ek: 12.5, vk: 29.99, vkLabel: 29.99 },
          { ean: '4012345910252', size: '40', qty: 7, ek: 12.5, vk: 29.99, vkLabel: 29.99 },
        ],
      },
    ],
  },
  {
    // Instruktions-Loop-Demo 1: ZWEI verschiedene OFFENE Meldungen an zwei
    // Positionen — „falscher Artikel" (Pos 1) + „Etikettenproblem" (Pos 2).
    // Badge in der PWA: „2x" komplett rot; Probleme-Lane zeigt beide einzeln.
    weBelegNo: '9.108.052', deliveryNoteNo: 'LS-25-9152', storageCode: 'R19',
    goodsTypeText: 'Nachorder', status: 'issue_open',
    checkMode: 'percentage_check', checkPercentage: 20, estimatedMinutes: 11,
    inboundCartonCount: 1,
    issues: [
      {
        reasonId: 'pr_wrong_article', positionIndex: 0,
        description: 'Gelieferter Artikel passt nicht zur Position — Karton enthält ART-2199 statt ART-2152.',
      },
      {
        reasonId: 'pr_label_problem', positionIndex: 1,
        description: 'Etiketten lassen sich nicht drucken — Vorlage meldet einen Preisfehler.',
      },
    ],
    positions: [
      {
        wgr: '111130', supplierArticleNo: 'ART-2152', supplierColor: 'bordeaux',
        labelPrintVariant: 'digitag_etikett_ohne_preis',
        skuLines: [
          { ean: '4012345910261', size: 'M', qty: 6, ek: 13.9, vk: 32.99, vkLabel: 32.99 },
          { ean: '4012345910262', size: 'L', qty: 6, ek: 13.9, vk: 32.99, vkLabel: 32.99 },
        ],
      },
      {
        wgr: '214520', supplierArticleNo: 'ART-2154', supplierColor: 'sand',
        skuLines: [
          { ean: '4012345910263', size: 'S', qty: 4, ek: 8.9, vk: 22.99, vkLabel: 22.99 },
          { ean: '4012345910264', size: 'M', qty: 4, ek: 8.9, vk: 22.99, vkLabel: 22.99 },
        ],
      },
    ],
  },
  {
    // Instruktions-Loop-Demo 2: TEILZUSTAND — eine Meldung instruiert (grün),
    // eine noch offen (rot). Beleg bleibt issue_open; Badge „2x" zweigeteilt.
    weBelegNo: '9.108.054', deliveryNoteNo: 'LS-25-9154', storageCode: 'R19',
    goodsTypeText: 'Nachorder', status: 'issue_open',
    checkMode: 'quantity_only', estimatedMinutes: 10,
    inboundCartonCount: 1,
    issues: [
      {
        reasonId: 'pr_wrong_color', positionIndex: 0,
        description: 'Farbe weicht ab: geliefert bordeaux, Arbeitsanweisung sagt marine.',
        instruction: 'Bordeaux ist die korrigierte Ware — bitte normal auszeichnen und weiterbearbeiten.',
      },
      {
        reasonId: 'pr_damaged_goods', positionIndex: 1,
        description: 'Zwei Teile mit Transportschaden (Nähte offen) — aussortieren?',
      },
    ],
    positions: [
      {
        wgr: '312400', supplierArticleNo: 'ART-2156', supplierColor: 'bordeaux',
        skuLines: [
          { ean: '4012345910281', size: 'M', qty: 5, ek: 11.5, vk: 27.99, vkLabel: 27.99 },
          { ean: '4012345910282', size: 'L', qty: 5, ek: 11.5, vk: 27.99, vkLabel: 27.99 },
        ],
      },
      {
        wgr: '218110', supplierArticleNo: 'ART-2157', supplierColor: 'ecru',
        skuLines: [
          { ean: '4012345910283', size: '38', qty: 6, ek: 10.5, vk: 25.99, vkLabel: 25.99 },
        ],
      },
    ],
  },
  {
    // Instruktions-Loop-Demo 3: KOMPLETT instruiert („Geklärt", grün) — mit
    // mehrstufigem Verlauf: Meldung → Instruktion → Rückmeldung → 2. Instruktion.
    weBelegNo: '9.108.053', deliveryNoteNo: 'LS-25-9153', storageCode: 'R19',
    goodsTypeText: 'Extrabestellung', status: 'problem_resolved',
    checkMode: 'quantity_only', estimatedMinutes: 9,
    inboundCartonCount: 1,
    issues: [
      {
        reasonId: 'pr_other', positionIndex: 0,
        description: 'Karton beschädigt angeliefert — Ware noch nicht geprüft.',
        instruction: 'Bitte Ware vollständig auspacken und auf Schäden prüfen.',
        rueckmeldung: 'Geprüft: Ware unbeschädigt, nur der Umkarton ist hinüber. Weiter normal?',
        zweiteInstruktion: 'Ja — Ware in Ordnung, normal weiterbearbeiten. Umkarton entsorgen.',
      },
    ],
    positions: [
      {
        wgr: '214520', supplierArticleNo: 'ART-2153', supplierColor: 'beige',
        skuLines: [
          { ean: '4012345910271', size: 'S', qty: 5, ek: 9.9, vk: 24.99, vkLabel: 24.99 },
          { ean: '4012345910272', size: 'M', qty: 5, ek: 9.9, vk: 24.99, vkLabel: 24.99 },
        ],
      },
    ],
  },
  // Stop 3 · PA-1 (Palette) — MISCH-BELEG (Kundenfeedback 03.08.2026): alle drei
  // Etikett-Druckvarianten auf EINEM Beleg, weil Digi Tags bereichsweise ausgerollt
  // werden. Zusätzlich NOS mit online-relevanter Position (Rot/Grün über die
  // CSV-Präferenzen: WGR 218110 → 38 grün, 40 rot).
  {
    weBelegNo: '9.108.031', deliveryNoteNo: 'LS-25-9131', storageCode: 'PA-1',
    goodsTypeText: 'NOS', status: 'assigned',
    checkMode: 'full_check', estimatedMinutes: 26,
    inboundCartonCount: 6,
    positions: [
      {
        wgr: '218110', supplierArticleNo: 'ART-2131', supplierColor: 'schwarz', nosFlag: true,
        onlineRelevant: true, securityTypeCode: 'spider-wrap',
        labelPrintVariant: 'etikett_mit_preis',
        skuLines: [
          { ean: '4012345910311', size: '38', qty: 10, ek: 12.5, vk: 29.99, vkLabel: 29.99 },
          { ean: '4012345910312', size: '40', qty: 10, ek: 12.5, vk: 29.99, vkLabel: 29.99 },
        ],
      },
      {
        // Digital ausgezeichnet: Etikett wird gedruckt, aber OHNE Preis.
        wgr: '111130', supplierArticleNo: 'ART-2132', supplierColor: 'blau', nosFlag: true,
        labelPrintVariant: 'digitag_etikett_ohne_preis',
        skuLines: [
          { ean: '4012345910321', size: 'M', qty: 8, ek: 10.9, vk: 27.99, vkLabel: 27.99 },
          { ean: '4012345910322', size: 'L', qty: 8, ek: 10.9, vk: 27.99, vkLabel: 27.99 },
          { ean: '4012345910323', size: 'XL', qty: 6, ek: 10.9, vk: 27.99, vkLabel: 27.99 },
        ],
      },
      {
        // Bereits ausgezeichnet angeliefert — hier wird gar nichts gedruckt.
        wgr: '312400', supplierArticleNo: 'ART-2133', supplierColor: 'khaki',
        labelPrintVariant: 'kein_etikett',
        skuLines: [
          { ean: '4012345910331', size: '32/34', qty: 9, ek: 21.5, vk: 54.99, vkLabel: 54.99 },
        ],
      },
    ],
  },
  // Stop 4 · HB-5/234 (Hängebahn) — REINER DIGI-TAG-BELEG: die Hängeware ist
  // komplett digital ausgezeichnet, alle Etiketten laufen OHNE Preis über den
  // Drucker (Kundenfeedback 03.08.2026).
  {
    weBelegNo: '9.108.041', deliveryNoteNo: 'LS-25-9141', storageCode: 'HB-5/234',
    goodsTypeText: 'Extrabestellung', status: 'assigned',
    checkMode: 'quantity_only', estimatedMinutes: 16,
    inboundCartonCount: 1,
    positions: [
      {
        wgr: '415210', supplierArticleNo: 'ART-2141', supplierColor: 'anthrazit', season: 'HW 26',
        securityTypeCode: 'ink-tag',
        labelPrintVariant: 'digitag_etikett_ohne_preis',
        skuLines: [
          { ean: '4012345910411', size: '48', qty: 6, ek: 39.9, vk: 99.99, vkLabel: 99.99 },
          { ean: '4012345910412', size: '50', qty: 8, ek: 39.9, vk: 99.99, vkLabel: 99.99 },
          { ean: '4012345910413', size: '52', qty: 6, ek: 39.9, vk: 99.99, vkLabel: 99.99 },
        ],
      },
    ],
  },
];

/** Abhol-Reihenfolge der Stops (Location-sequenceIndex: R7 → R19 → PA-1 → HB-5/234). */
const MA108_STOP_ORDER = ['R7', 'R19', 'PA-1', 'HB-5/234'] as const;

/** Stop 2 (R19) ist bereits geholt — dort liegen die schon bearbeiteten Fälle. */
const MA108_SCANNED_STOPS = new Set(['R19']);

/**
 * Pack-Grenze des Demo-Bündels (Pull-Prinzip): ab diesem Beleg beginnt das
 * VORGEPLANTE Folge-Pack. Es steht im DAMB-Board der Teamleitung als „Pack 2",
 * ist in der Mitarbeiter-App aber unsichtbar, bis Hakan es anfordert.
 *
 * Damit sind alle drei Regeln am Demo-Datensatz nachstellbar:
 *  - Pack 1 (aktiv, Stops R7 + R19): drei offene Belege, ein fertiger, ein
 *    geklärter und ZWEI mit noch offenem Problem.
 *  - „Nächstes Pack" bleibt gesperrt, bis die drei offenen und der geklärte
 *    Beleg fertig sind — die beiden Problem-Belege blockieren bewusst NICHT.
 *  - Nach dem Wechsel auf Pack 2 bleiben genau diese Problem-Belege sichtbar,
 *    zählen aber weiter auf Pack 1.
 */
const MA108_FOLLOW_UP_PACK_START_WE = '9.108.031';

function ma108TotalQuantity(spec: Ma108CaseSpec): number {
  return spec.positions.reduce(
    (sum, p) => sum + p.skuLines.reduce((s, l) => s + l.qty, 0),
    0,
  );
}

/** Ohne Angabe gilt der klassische Fall „Etikett mit Preis" (bisheriger stiller Standard). */
function ma108LabelPrintVariant(position: Ma108PositionSpec): LabelPrintVariant {
  return position.labelPrintVariant ?? 'etikett_mit_preis';
}

function ma108InspectionLevel(spec: Ma108CaseSpec): 'none' | 'p10' | 'p20' | 'full' {
  if (spec.checkMode === 'quantity_only') return 'none';
  if (spec.checkMode === 'full_check') return 'full';
  return spec.checkPercentage === 10 ? 'p10' : 'p20';
}

export async function seedMa108DemoBundle(
  prisma: ScenarioPrisma,
  baseDate: string,
  locationIds: Record<string, string>,
  userIds: Record<string, string>,
): Promise<void> {
  const employeeId = requireId(userIds, 'ma-108', 'user');
  const teamleadId = requireId(userIds, 'tl-001', 'user');
  // Autoren-Snapshots für die Verlaufs-Einträge der Demo-Meldungen.
  const [maUser, tlUser] = await Promise.all([
    prisma.user.findUnique({ where: { id: employeeId }, select: { displayName: true } }),
    prisma.user.findUnique({ where: { id: teamleadId }, select: { displayName: true } }),
  ]);
  const maName = maUser?.displayName ?? 'Mitarbeiter';
  const tlName = tlUser?.displayName ?? 'Teamleitung';

  // 1) Belege + explizite Detail-Aggregate (Positionen, Größen-Zeilen, Boxen).
  const caseIdByWeBelegNo = new Map<string, string>();
  for (const spec of MA108_CASES) {
    const totalQuantity = ma108TotalQuantity(spec);
    const isCompletion = spec.status === 'completed';
    const caseData = {
      source: 'prohandel_api' as const,
      externalRef: `dev-seed:${spec.weBelegNo}`,
      deliveryNoteNo: spec.deliveryNoteNo,
      bookingDate: asDate(baseDate),
      weDate: asDate(baseDate),
      branchNo: '001',
      primaryShopAreaNo: '21',
      primaryShopNo: '21',
      primaryFloor: 'EG',
      storageLocationId: requireId(locationIds, spec.storageCode, 'location'),
      section: 4,
      goodsTypeText: spec.goodsTypeText,
      priorityFlags: [] as PriorityFlag[],
      catManDate: spec.positions.some((p) => p.catManOffsetDays !== undefined)
        ? offsetDate(baseDate, Math.min(...spec.positions
            .map((p) => p.catManOffsetDays)
            .filter((d): d is number => d !== undefined)))
        : null,
      totalQuantity,
      inboundCartonCount: spec.inboundCartonCount,
      status: spec.status,
      effortPoints: round2(spec.estimatedMinutes / 2.2),
      estimatedMinutes: spec.estimatedMinutes,
      completedAt: isCompletion && spec.completedAt ? asTime(baseDate, spec.completedAt) : null,
      docuWareUrl: isCompletion ? docuWareUrlFor(spec.weBelegNo) : null,
    };
    const gcase = await prisma.goodsReceiptCase.upsert({
      where: { weBelegNo: spec.weBelegNo },
      update: { ...caseData, assignedBundleId: null },
      create: { weBelegNo: spec.weBelegNo, ...caseData },
    });
    caseIdByWeBelegNo.set(spec.weBelegNo, gcase.id);

    const headerData = {
      // Abgeleitet aus den Positions-Varianten — genau wie im echten Intake-Pfad.
      priceLabelPrintRequired: spec.positions.some((p) =>
        labelPrintRequired(ma108LabelPrintVariant(p)),
      ),
      goodsReceiptCheckMode: spec.checkMode,
      goodsReceiptCheckPercentage: spec.checkPercentage ?? null,
      inspectionLevelCode: ma108InspectionLevel(spec),
      boxLabelRequired: true,
      zstRequired: true,
    };
    await prisma.workInstructionHeader.upsert({
      where: { caseId: gcase.id },
      update: headerData,
      create: { caseId: gcase.id, ...headerData },
    });

    await prisma.receiptPosition.deleteMany({
      where: { caseId: gcase.id, positionNo: { gt: spec.positions.length } },
    });
    const positionIds: string[] = [];
    for (const [idx, p] of spec.positions.entries()) {
      const catManDate =
        p.catManOffsetDays === undefined ? null : offsetDate(baseDate, p.catManOffsetDays);
      const positionData = {
        wgr: p.wgr,
        supplierArticleNo: p.supplierArticleNo,
        supplierColor: p.supplierColor,
        season: p.season ?? null,
        nosFlag: p.nosFlag ?? null,
        floor: 'EG',
        catMan: p.catManOffsetDays !== undefined,
        catManDate,
        orderNo: `ORD-${spec.weBelegNo}-${idx + 1}`,
        shopNo: '21',
        hShopNo: '21',
        branchNo: '001',
        onlineRelevant: p.onlineRelevant ?? false,
      };
      const position = await prisma.receiptPosition.upsert({
        where: { position_case_no: { caseId: gcase.id, positionNo: idx + 1 } },
        update: positionData,
        create: { caseId: gcase.id, positionNo: idx + 1, ...positionData },
      });
      positionIds.push(position.id);

      const labelPrintVariant = ma108LabelPrintVariant(p);
      const instruction = {
        labelPrintVariant,
        // Anbringen setzt ein gedrucktes Etikett voraus.
        priceLabelAttachRequired: idx === 0 && labelPrintRequired(labelPrintVariant),
        securityRequired: (p.securityTypeCode ?? null) !== null,
        securityTypeCode: p.securityTypeCode ?? null,
        onlineHandlingRequired: p.onlineRelevant ?? false,
      };
      await prisma.positionInstruction.upsert({
        where: { positionId: position.id },
        update: instruction,
        create: { positionId: position.id, ...instruction },
      });

      await prisma.receiptSkuLine.deleteMany({
        where: { receiptPositionId: position.id, ean: { notIn: p.skuLines.map((l) => l.ean) } },
      });
      for (const line of p.skuLines) {
        const skuData = {
          expectedQuantity: line.qty,
          ekPrice: line.ek,
          vkPrice: line.vk,
          vkLabelPrice: line.vkLabel,
          // Der fertige Beleg trägt die verbuchten Ist-Mengen (Nur-Ansicht der PWA).
          ...(isCompletion ? { confirmedQuantity: line.qty } : {}),
        };
        await prisma.receiptSkuLine.upsert({
          where: {
            sku_position_ean_size: {
              receiptPositionId: position.id,
              ean: line.ean,
              size: line.size,
            },
          },
          update: skuData,
          create: { receiptPositionId: position.id, ean: line.ean, size: line.size, ...skuData },
        });
      }
    }

    await prisma.transportBox.deleteMany({ where: { caseId: gcase.id } });
    await prisma.transportBox.create({
      data: {
        caseId: gcase.id,
        boxNo: 1,
        branchNo: '001',
        shopAreaNo: '21',
        shopNo: '21',
        floor: 'EG',
        plannedQuantity: totalQuantity,
        positionIds,
        goodsType: boxGoodsTypeFromCase(spec.goodsTypeText),
        goodsTypeText: spec.goodsTypeText,
      },
    });

    // ZST des fertigen Belegs (KPI-Kachel + Archiv-Ansicht).
    if (isCompletion && spec.completedAt) {
      await prisma.zstRecord.upsert({
        where: { idempotencyKey: `seed-zst:${spec.weBelegNo}` },
        update: {
          completedQuantity: totalQuantity,
          effortPoints: caseData.effortPoints,
          completedAt: asTime(baseDate, spec.completedAt),
        },
        create: {
          idempotencyKey: `seed-zst:${spec.weBelegNo}`,
          caseId: gcase.id,
          employeeId,
          completedQuantity: totalQuantity,
          effortPoints: caseData.effortPoints,
          startedAt: asTime(baseDate, '11:05'),
          completedAt: asTime(baseDate, spec.completedAt),
          source: 'mobile_app',
        },
      });
    }

    // Instruktions-Loop-Demo (Kundenfeedback 04.08.2026): Meldungen je Position
    // inkl. Verlauf Meldung → Instruktion → Rückmeldung → zweite Instruktion.
    if (spec.issues?.length) {
      const existing = await prisma.issue.findFirst({ where: { caseId: gcase.id } });
      if (!existing) {
        for (const [index, issueSpec] of spec.issues.entries()) {
          const reason = await prisma.problemReason.findUnique({
            where: { id: issueSpec.reasonId },
          });
          // Einzel-Status aus dem Verlauf: letzte Instruktion unbeantwortet ⇒
          // instruction_sent, sonst (keine/beantwortete Instruktion) open.
          const status =
            issueSpec.zweiteInstruktion != null ||
            (issueSpec.instruction != null && issueSpec.rueckmeldung == null)
              ? 'instruction_sent'
              : 'open';
          const minute = (step: number) => asTime(baseDate, `1${step}:${38 + index * 2}`);
          const issue = await prisma.issue.create({
            data: {
              caseId: gcase.id,
              scope: 'position',
              scopeId: positionIds[issueSpec.positionIndex] ?? positionIds[0],
              employeeId,
              kind: 'manual',
              reasonId: reason?.id,
              reasonLabel: reason?.label,
              description: issueSpec.description,
              status,
              reportedAt: minute(1),
            },
          });
          const verlauf = [
            { kind: 'meldung' as const, role: 'employee' as const, name: maName, text: issueSpec.description, at: minute(1) },
            ...(issueSpec.instruction
              ? [{ kind: 'instruktion' as const, role: 'teamlead' as const, name: tlName, text: issueSpec.instruction, at: minute(2) }]
              : []),
            ...(issueSpec.rueckmeldung
              ? [{ kind: 'rueckmeldung' as const, role: 'employee' as const, name: maName, text: issueSpec.rueckmeldung, at: minute(3) }]
              : []),
            ...(issueSpec.zweiteInstruktion
              ? [{ kind: 'instruktion' as const, role: 'teamlead' as const, name: tlName, text: issueSpec.zweiteInstruktion, at: minute(4) }]
              : []),
          ];
          await prisma.issueMessage.createMany({
            data: verlauf.map((m) => ({
              issueId: issue.id,
              authorId: m.role === 'employee' ? employeeId : teamleadId,
              authorName: m.name,
              authorRole: m.role,
              kind: m.kind,
              text: m.text,
              createdAt: m.at,
            })),
          });
        }
      }
    }
  }

  // 2) Das Bündel selbst: heute, aktiv (Arbeit hat begonnen — der Fertig-Beleg
  //    beweist es), direkt von der Teamleitung zugewiesen. Es trägt ZWEI Packs;
  //    aktiv ist das erste (activePackIndex bleibt beim Default 0).
  const followUpStart = MA108_CASES.findIndex(
    (c) => c.weBelegNo === MA108_FOLLOW_UP_PACK_START_WE,
  );
  const packIndexOf = (index: number): number =>
    followUpStart >= 0 && index >= followUpStart ? 1 : 0;

  const bundle = await prisma.assignmentBundle.create({
    data: {
      employeeId,
      date: asDate(baseDate),
      plannedEffortMinutes: MA108_CASES.reduce((s, c) => s + c.estimatedMinutes, 0),
      effortPoints: round2(
        MA108_CASES.reduce((s, c) => s + c.estimatedMinutes / 2.2, 0),
      ),
      status: 'active',
      createdBy: 'teamlead',
      activePackIndex: 0,
    },
  });
  for (const [index, spec] of MA108_CASES.entries()) {
    const caseId = caseIdByWeBelegNo.get(spec.weBelegNo);
    if (!caseId) continue;
    await prisma.assignmentItem.create({
      data: { bundleId: bundle.id, caseId, sequence: index, packIndex: packIndexOf(index) },
    });
    await prisma.goodsReceiptCase.update({
      where: { id: caseId },
      data: {
        assignedBundleId: bundle.id,
        // Ware-holen-Haken (B2) konsistent zum Stop-Seeding unten: am bereits
        // gescannten Stop geholt; begonnene/fertige Belege waren es zwangsläufig.
        collectedAt:
          MA108_SCANNED_STOPS.has(spec.storageCode) || spec.status !== 'assigned'
            ? asTime(baseDate, '09:20')
            : null,
      },
    });
  }
  for (const [index, code] of MA108_STOP_ORDER.entries()) {
    await prisma.routeStop.create({
      data: {
        bundleId: bundle.id,
        sequence: index + 1,
        locationId: requireId(locationIds, code, 'location'),
        locationCode: code,
        scanRequired: true,
        scannedAt: MA108_SCANNED_STOPS.has(code) ? asTime(baseDate, '09:20') : null,
      },
    });
  }
}

/**
 * A7 TL-Topf: flag ONE ready pool case for „Besondere Aufmerksamkeit" so the Topf
 * also shows a plan-/zuweisbarer Beleg (not only triage states). Deterministic:
 * always the first ready case by weBelegNo, so re-running flags the same Beleg.
 */
export async function seedReadyAttentionFlag(prisma: ScenarioPrisma): Promise<void> {
  const target = await prisma.goodsReceiptCase.findFirst({
    where: { status: 'ready' },
    orderBy: { weBelegNo: 'asc' },
    select: { id: true },
  });
  if (!target) return;
  await prisma.goodsReceiptCase.update({
    where: { id: target.id },
    data: {
      attentionFlag: true,
      attentionNote: 'Bucherin: Ware bitte gesondert prüfen (Reklamation beim letzten Mal).',
    },
  });
}

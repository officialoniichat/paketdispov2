// Case-graph building blocks (extracted from the former monolithic prisma/seed.ts).
// Scenarios compose these AFTER `seedMasterData`: the generated ready pool, the
// per-case detail aggregate (header/positions/SKU lines/boxes), the lifecycle
// fixtures for the Belege scopes, the mock-ProHandel batch and the Intake-Gate /
// Lieferungs-Hold fixtures. Deterministic and idempotent by natural keys.
import type { BoxGoodsType, GoodsTypeText, PriorityFlag } from '@prisma/client';
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
    // B3: Etikettendruck NICHT auf jedem Beleg — sonst trägt der Chip „🏷️ Etiketten
    // drucken" am Bündel-Home keine Information mehr. Dustin will genau daran
    // erkennen, ob er zum Drucker muss. Deterministische Teilmenge (zwei von drei
    // Belegen), analog zu `onlineDemoCase` weiter unten.
    const printDemoCase = Number(c.weBelegNo.replace(/\D/g, '').slice(-1)) % 3 !== 0;
    const headerData = {
      priceLabelPrintRequired: printDemoCase,
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

    // Positions carry a destination: Filiale / Shopbereich / Etage. Most Belege ship
    // to ONE Etage → one Transportbox. A deterministic subset puts a second position
    // on another Etage to demo the real split (one box per Shopbereich/Shop/Etage).
    const positionCount = Math.min(params.positionCount, Math.max(1, Math.floor(c.totalQuantity / 4) || 1));
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

      // Positionsanweisung inkl. Sicherungstyp-Piktogramm (A4).
      const instruction = {
        priceLabelRequired: true,
        priceLabelAttachRequired: p.positionNo === 1,
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

    // Open problem for the issue_open case (Problemfälle lane). Idempotent: only
    // create when this case has no open issue yet. Probleme hängen an einer
    // Position (Kundenfeedback 14.07.2026) — die erste Position des Belegs, falls
    // die Detail-Daten schon geseedet sind.
    if (c.issue) {
      const existing = await prisma.issue.findFirst({
        where: { caseId: gcase.id, status: 'open' },
      });
      if (!existing) {
        const firstPosition = await prisma.receiptPosition.findFirst({
          where: { caseId: gcase.id },
          orderBy: { positionNo: 'asc' },
          select: { id: true },
        });
        const reason = c.issue.reasonId
          ? await prisma.problemReason.findUnique({ where: { id: c.issue.reasonId } })
          : null;
        await prisma.issue.create({
          data: {
            caseId: gcase.id,
            scope: 'position',
            scopeId: firstPosition?.id,
            employeeId,
            kind: c.issue.kind ?? 'manual',
            reasonId: reason?.id,
            reasonLabel: reason?.label,
            deviationQty: c.issue.deviationQty,
            description: c.issue.description,
            status: 'open',
          },
        });
      }
    }
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

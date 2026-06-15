import type { GoodsTypeText, Id, TransportBoxTarget } from '@paket/domain-types';

/**
 * Transport-box computation & splitting (Anhang D TransportBoxTarget; §3.2 line
 * "Transportboxen splitten"). Finished goods are boxed **per Shopbereich / Shop /
 * Etage**; when a case spans several targets it is split into one box per target
 * and labelled separately. Box targets are derived automatically from positions.
 */

type BoxGoodsType = TransportBoxTarget['goodsType'];

/** One position's contribution to box splitting. */
export interface BoxSplitPosition {
  positionId: Id;
  shopNo?: string;
  hShopNo?: string;
  floor?: string;
  /** Optional per-position shop-area override; falls back to the case default. */
  shopAreaNo?: string;
  /** Planned quantity (sum of the position's SKU expected quantities). */
  quantity: number;
}

/** Case-level context shared by every box of the case. */
export interface BoxSplitContext {
  caseId: Id;
  branchNo: string;
  /** case.primaryShopAreaNo – default when a position carries none. */
  defaultShopAreaNo: string;
  /** case.primaryFloor – default when a position carries none. */
  defaultFloor?: string;
  goodsTypeText?: GoodsTypeText;
  /** WorkInstructionHeader.boxLabelRequired (§ box label). */
  boxLabelRequired: boolean;
}

/** A planned box target (subset of TransportBoxTarget produced before persistence). */
export interface ComputedBoxTarget {
  caseId: Id;
  boxNo: number;
  branchNo: string;
  shopAreaNo: string;
  shopNo?: string;
  hShopNo?: string;
  floor?: string;
  goodsType: BoxGoodsType;
  positionIds: Id[];
  plannedQuantity: number;
  labelStatus: TransportBoxTarget['labelStatus'];
}

const GOODS_TYPE_MAP: Readonly<Record<GoodsTypeText, BoxGoodsType>> = {
  Vororder: 'vororder',
  Nachorder: 'nachorder',
  Sonderposten: 'sopo',
  NOS: 'nos',
  NOOS: 'nos',
  Extrabestellung: 'extrabestellung',
  'NOS-Nachorder': 'nos_nachorder',
  Prio: 'prio',
};

/** Map the document goods-type text to the box routing goods-type (Anhang D). */
export function toBoxGoodsType(text: GoodsTypeText | undefined): BoxGoodsType {
  return text ? GOODS_TYPE_MAP[text] : 'mixed';
}

/** Resolved routing target of a position after applying case defaults. */
interface BoxGroupTarget {
  shopAreaNo: string;
  shopNo?: string;
  hShopNo?: string;
  floor?: string;
}

function resolveTarget(p: BoxSplitPosition, ctx: BoxSplitContext): BoxGroupTarget {
  return {
    shopAreaNo: p.shopAreaNo ?? ctx.defaultShopAreaNo,
    shopNo: p.shopNo,
    hShopNo: p.hShopNo,
    floor: p.floor ?? ctx.defaultFloor,
  };
}

/** Stable grouping key: a separate box per Shopbereich / Shop / hShop / Etage. */
export function boxGroupKey(p: BoxSplitPosition, ctx: BoxSplitContext): string {
  const t = resolveTarget(p, ctx);
  return [t.shopAreaNo, t.shopNo ?? '', t.hShopNo ?? '', t.floor ?? ''].join('|');
}

/**
 * Compute the box targets for a case. Positions with no planned quantity create no
 * box. Targets are emitted in a deterministic order (shop-area, shop, hShop, floor)
 * and numbered from 1, so re-running on unchanged input is idempotent.
 */
export function computeBoxTargets(
  ctx: BoxSplitContext,
  positions: readonly BoxSplitPosition[],
): ComputedBoxTarget[] {
  const groups = new Map<string, { target: BoxGroupTarget; items: BoxSplitPosition[] }>();
  for (const p of positions) {
    if (p.quantity <= 0) continue;
    const key = boxGroupKey(p, ctx);
    const bucket = groups.get(key);
    if (bucket) bucket.items.push(p);
    else groups.set(key, { target: resolveTarget(p, ctx), items: [p] });
  }

  const goodsType = toBoxGoodsType(ctx.goodsTypeText);
  const labelStatus: TransportBoxTarget['labelStatus'] = ctx.boxLabelRequired
    ? 'pending'
    : 'not_required';

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, group], index): ComputedBoxTarget => {
      const { target, items } = group;
      return {
        caseId: ctx.caseId,
        boxNo: index + 1,
        branchNo: ctx.branchNo,
        shopAreaNo: target.shopAreaNo,
        shopNo: target.shopNo,
        hShopNo: target.hShopNo,
        floor: target.floor,
        goodsType,
        positionIds: items.map((i) => i.positionId),
        plannedQuantity: items.reduce((sum, i) => sum + i.quantity, 0),
        labelStatus,
      };
    });
}

/** Number of boxes a case splits into – feeds `splitBoxCount * boxSplitPenalty` (§8.2). */
export function splitBoxCount(targets: readonly ComputedBoxTarget[]): number {
  return targets.length;
}

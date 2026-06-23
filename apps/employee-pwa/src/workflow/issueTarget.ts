/**
 * Pure resolver for a problem-report target. No I/O.
 *
 * A problem is reported against a concrete entity (the whole Beleg, a position,
 * a SKU line, or a transport box) so the Teamlead knows exactly what is affected
 * (§9.7). The worker enters the form from that entity, so the scope + scopeId are
 * already known; this resolver turns them into a validated target + a German
 * label, and defends against a stale/unknown scopeId by falling back to the case.
 */
import { issueScopeSchema, type IssueScope } from '@paket/domain-types';
import type { CaseAggregate } from '../db/types.js';

export interface IssueTarget {
  scope: IssueScope;
  /** Undefined for the case-level target. */
  scopeId?: string;
  /** Human-readable description of what the problem is reported against. */
  label: string;
}

/** Parse a raw query value into an IssueScope, or undefined when invalid. */
export function parseScope(raw: string | null): IssueScope | undefined {
  const parsed = issueScopeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/** Resolve scope + scopeId against the aggregate into a concrete, labelled target. */
export function resolveIssueTarget(
  aggregate: CaseAggregate,
  scope: IssueScope | undefined,
  scopeId: string | undefined,
): IssueTarget {
  const caseTarget: IssueTarget = {
    scope: 'case',
    label: `Ganzer Beleg · WE ${aggregate.case.weBelegNo}`,
  };
  if (!scope || scope === 'case') return caseTarget;

  if (scope === 'position') {
    const pos = aggregate.positions.find((p) => p.id === scopeId);
    if (!pos) return caseTarget;
    return {
      scope,
      scopeId,
      label: `Position ${pos.positionNo} · ${pos.supplierArticleNo}`,
    };
  }

  if (scope === 'sku_line') {
    for (const pos of aggregate.positions) {
      const sku = pos.skuLines.find((s) => s.id === scopeId);
      if (sku) {
        return {
          scope,
          scopeId,
          label: `Position ${pos.positionNo} · Größe ${sku.size} (EAN ${sku.ean})`,
        };
      }
    }
    return caseTarget;
  }

  // transport_box
  const box = aggregate.boxTargets.find((b) => b.id === scopeId);
  if (!box) return caseTarget;
  return { scope, scopeId, label: `Box · Shopbereich ${box.shopAreaNo}` };
}

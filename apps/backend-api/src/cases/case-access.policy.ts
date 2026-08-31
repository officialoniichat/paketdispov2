import { Role, type Principal } from '../auth/rbac.js';

/**
 * Case visibility policy (§5 / §16.1).
 *
 * Teamlead and Admin steer the full pool. An Employee may ONLY see their own
 * packages — never the full pool, never a colleague's package. IT/Support holds
 * technical rights but no business case data.
 */
export function isPoolViewer(principal: Principal): boolean {
  return principal.roles.some((r) => r === Role.Teamlead || r === Role.Admin);
}

/**
 * @param ownerEmployeeNo employeeNo of the worker the case is assigned to, or
 *   null/undefined if the case is still in the unassigned pool.
 * @param participantEmployeeNos employeeNos der AKTIVEN Beteiligten eines geteilten
 *   Belegs (`angenommen`|`teil_erledigt`, Konzept beleg-zusammenarbeit §5.1) — sie
 *   sehen und bearbeiten den Beleg wie der Inhaber. Eingeladene gehören NICHT dazu.
 */
export function canAccessCase(
  principal: Principal,
  ownerEmployeeNo: string | null | undefined,
  participantEmployeeNos: readonly string[] = [],
): boolean {
  if (isPoolViewer(principal)) return true;
  if (principal.roles.includes(Role.Employee) && principal.employeeNo) {
    return (
      ownerEmployeeNo === principal.employeeNo ||
      participantEmployeeNos.includes(principal.employeeNo)
    );
  }
  return false;
}

/** Raised when a principal may not see/act on a case. Mapped to 404 for employees. */
export class CaseAccessDeniedError extends Error {
  constructor(readonly caseId: string) {
    super(`Access to case ${caseId} denied`);
    this.name = 'CaseAccessDeniedError';
  }
}

export function assertCanAccessCase(
  principal: Principal,
  caseId: string,
  ownerEmployeeNo: string | null | undefined,
  participantEmployeeNos: readonly string[] = [],
): void {
  if (!canAccessCase(principal, ownerEmployeeNo, participantEmployeeNos)) {
    throw new CaseAccessDeniedError(caseId);
  }
}

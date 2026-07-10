/**
 * Fixed seed constants shared between `seed.ts` (writes them to the ephemeral
 * Postgres) and `employee-flow.spec.ts` (asserts on them). Keeping these as
 * plain static constants — rather than handing back DB-generated ids through
 * a file/global — is enough because the spec only ever asserts on rendered
 * TEXT (weBelegNo, locationCode), never on an internal id.
 */
export interface SeedEmployeeSpec {
  employeeNo: string;
  displayName: string;
  locationCode: string;
  weBelegNos: string[];
}

export const MA_101: SeedEmployeeSpec = {
  employeeNo: 'ma-101',
  displayName: 'Mitarbeiter 101',
  locationCode: 'E2E-R1',
  weBelegNos: ['WE-E2E-101-1', 'WE-E2E-101-2'],
};

export const MA_102: SeedEmployeeSpec = {
  employeeNo: 'ma-102',
  displayName: 'Mitarbeiter 102',
  locationCode: 'E2E-R2',
  weBelegNos: ['WE-E2E-102-1'],
};

/** No seeded employee has this number — used to prove an unknown one is rejected. */
export const UNKNOWN_EMPLOYEE_NO = 'ma-999';

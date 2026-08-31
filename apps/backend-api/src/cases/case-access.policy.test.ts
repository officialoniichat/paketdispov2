import { describe, expect, it } from 'vitest';
import { Role, type Principal } from '../auth/rbac.js';
import {
  CaseAccessDeniedError,
  assertCanAccessCase,
  canAccessCase,
  isPoolViewer,
} from './case-access.policy.js';

const principal = (roles: Role[], employeeNo?: string): Principal => ({
  sub: 'sub',
  employeeNo,
  roles,
  claims: {},
});

const employee = principal([Role.Employee], 'E-1');
const otherEmployee = principal([Role.Employee], 'E-2');
const teamlead = principal([Role.Teamlead], 'T-1');
const admin = principal([Role.Admin], 'A-1');
const itSupport = principal([Role.It], 'I-1');

describe('case access policy (§16.1)', () => {
  it('lets an employee access their OWN package', () => {
    expect(canAccessCase(employee, 'E-1')).toBe(true);
  });

  it('NEVER lets an employee access a colleague’s package', () => {
    expect(canAccessCase(otherEmployee, 'E-1')).toBe(false);
  });

  it('NEVER lets an employee access an unassigned pool case (null owner)', () => {
    expect(canAccessCase(employee, null)).toBe(false);
    expect(canAccessCase(employee, undefined)).toBe(false);
  });

  it('lässt einen AKTIVEN Beteiligten eines geteilten Belegs zugreifen (§5.1)', () => {
    expect(canAccessCase(otherEmployee, 'E-1', ['E-2'])).toBe(true);
    expect(() => assertCanAccessCase(otherEmployee, 'case-1', 'E-1', ['E-2'])).not.toThrow();
  });

  it('wer nicht in der Beteiligten-Menge steht, bleibt draußen — auch mit Beteiligten', () => {
    const third = principal([Role.Employee], 'E-3');
    expect(canAccessCase(third, 'E-1', ['E-2'])).toBe(false);
    // Eingeladene gehören nicht in die Menge — der Aufrufer übergibt nur AKTIVE.
    expect(canAccessCase(third, null, ['E-2'])).toBe(false);
  });

  it('Beteiligten-Menge greift auch ohne Inhaber (Beleg gerade ohne Bündel)', () => {
    expect(canAccessCase(otherEmployee, null, ['E-2'])).toBe(true);
  });

  it('lets teamlead and admin steer the full pool', () => {
    expect(isPoolViewer(teamlead)).toBe(true);
    expect(isPoolViewer(admin)).toBe(true);
    expect(canAccessCase(teamlead, 'E-1')).toBe(true);
    expect(canAccessCase(teamlead, null)).toBe(true);
    expect(canAccessCase(admin, 'E-9')).toBe(true);
  });

  it('denies IT/Support business case data', () => {
    expect(isPoolViewer(itSupport)).toBe(false);
    expect(canAccessCase(itSupport, 'I-1')).toBe(false);
    expect(canAccessCase(itSupport, null)).toBe(false);
  });

  it('assertCanAccessCase throws for a foreign package', () => {
    expect(() => assertCanAccessCase(otherEmployee, 'case-1', 'E-1')).toThrow(
      CaseAccessDeniedError,
    );
    expect(() => assertCanAccessCase(employee, 'case-1', 'E-1')).not.toThrow();
  });
});

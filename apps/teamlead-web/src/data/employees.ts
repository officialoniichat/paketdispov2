/**
 * §11 Mitarbeiter-Einstellungen data layer. Fetches `/api/admin/employees/*` and
 * surfaces the generated DTOs the EmployeeSettings feature renders. Same boundary
 * conventions as {@link ./admin}: openapi-fetch + {@link ./http} unwrap, no `any`.
 */
import type { components } from '@paket/api-client';
import { api } from './api.js';
import { describeCause, hasFetchError, unwrap } from './http.js';

export type EmployeeListResponse = components['schemas']['EmployeeListResponseDto'];
export type EmployeeListItem = components['schemas']['EmployeeListItemDto'];
export type EmployeeDetail = components['schemas']['EmployeeDetailDto'];
export type EmployeeProfileUpdate = components['schemas']['EmployeeProfileUpdateDto'];
export type EmployeeCreate = components['schemas']['EmployeeCreateDto'];
export type WeeklyPattern = components['schemas']['WeeklyPatternDto'];
export type Workstation = components['schemas']['WorkstationDto'];

/** List employees with today's (or a given day's) shift, capacity and absence. */
export async function fetchEmployees(date?: string): Promise<EmployeeListResponse> {
  const result = await api.GET('/api/admin/employees', {
    params: { query: date ? { date } : {} },
  });
  return unwrap<EmployeeListResponse>(result, 'Laden der Mitarbeiter');
}

/** Employee detail incl. weekly pattern + recent audit. */
export async function fetchEmployee(id: string, date?: string): Promise<EmployeeDetail> {
  const result = await api.GET('/api/admin/employees/{id}', {
    params: { path: { id }, query: date ? { date } : {} },
  });
  return unwrap<EmployeeDetail>(result, 'Laden des Mitarbeiters');
}

/** Active workstations (Tische) — Arbeitsplatz options for the employee detail select. */
export async function fetchWorkstations(): Promise<Workstation[]> {
  const result = await api.GET('/api/admin/employees/workstations');
  return unwrap<Workstation[]>(result, 'Laden der Arbeitsplätze');
}

/** Create an employee — by default a temporäre Kraft (measured=false, ohne Messung). */
export async function createEmployee(body: EmployeeCreate): Promise<EmployeeDetail> {
  const result = await api.POST('/api/admin/employees', { body });
  return unwrap<EmployeeDetail>(result, 'Anlegen des Mitarbeiters');
}

/** Patch profile (active, areaTags, productivity, overtime, pattern). */
export async function updateEmployeeProfile(
  id: string,
  patch: EmployeeProfileUpdate,
): Promise<EmployeeDetail> {
  const result = await api.PATCH('/api/admin/employees/{id}', {
    params: { path: { id } },
    body: patch,
  });
  return unwrap<EmployeeDetail>(result, 'Speichern des Mitarbeiterprofils');
}

/**
 * Set/reset an employee's Mitarbeiter-App login PIN (Employee-Login Task 5).
 * 204 No Content on success — no body to unwrap, so this checks the error
 * channel directly rather than `unwrap()` (which requires a response body).
 */
export async function resetEmployeePin(id: string, pin: string): Promise<void> {
  const result = await api.PATCH('/api/admin/employees/{id}/pin', {
    params: { path: { id } },
    body: { pin },
  });
  if (hasFetchError(result)) {
    throw new Error(`Zurücksetzen der PIN fehlgeschlagen (${describeCause(result.error)})`);
  }
}

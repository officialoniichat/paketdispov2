/**
 * §11 Mitarbeiter-Einstellungen data layer. Fetches `/api/admin/employees/*` and
 * surfaces the generated DTOs the EmployeeSettings feature renders. Same boundary
 * conventions as {@link ./admin}: openapi-fetch + {@link ./http} unwrap, no `any`.
 */
import type { components } from '@paket/api-client';
import { api } from './api.js';
import { unwrap } from './http.js';

export type EmployeeListResponse = components['schemas']['EmployeeListResponseDto'];
export type EmployeeListItem = components['schemas']['EmployeeListItemDto'];
export type EmployeeDetail = components['schemas']['EmployeeDetailDto'];
export type EmployeeProfileUpdate = components['schemas']['EmployeeProfileUpdateDto'];
export type EmployeeCreate = components['schemas']['EmployeeCreateDto'];
export type WeeklyPattern = components['schemas']['WeeklyPatternDto'];

/** List employees with today's (or a given day's) shift, capacity and absence. */
export async function fetchEmployees(date?: string): Promise<EmployeeListResponse> {
  const result = await api.GET('/api/admin/employees', {
    params: { query: date ? { date } : {} },
  });
  return unwrap<EmployeeListResponse>(result, 'employees');
}

/** Employee detail incl. weekly pattern + recent audit. */
export async function fetchEmployee(id: string, date?: string): Promise<EmployeeDetail> {
  const result = await api.GET('/api/admin/employees/{id}', {
    params: { path: { id }, query: date ? { date } : {} },
  });
  return unwrap<EmployeeDetail>(result, 'employee');
}

/** Create an employee — by default a temporäre Kraft (measured=false, ohne Messung). */
export async function createEmployee(body: EmployeeCreate): Promise<EmployeeDetail> {
  const result = await api.POST('/api/admin/employees', { body });
  return unwrap<EmployeeDetail>(result, 'create employee');
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
  return unwrap<EmployeeDetail>(result, 'update employee');
}

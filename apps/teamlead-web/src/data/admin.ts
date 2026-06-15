/**
 * §11 Admin data layer (location master + structured rule config). Fetches the
 * `/api/admin/*` endpoints and projects the generated DTOs onto the domain-types
 * shapes the AdminPage + LocationMasterEditor render. Mirrors {@link ./belege} and
 * {@link ./remoteDataset}: boundary narrowing of enum-ish DTO fields goes through
 * the @paket/domain-types Zod schemas (no bare `as`, no `any`).
 */
import {
  locationKindSchema,
  ruleConfigSchema,
  type LocationKind,
  type LocationMaster,
  type RuleConfig,
} from '@paket/domain-types';
import type { components } from '@paket/api-client';
import { api } from './api.js';

type LocationDto = components['schemas']['LocationDto'];
type LocationUpsertDto = components['schemas']['LocationUpsertDto'];
type RuleConfigDto = components['schemas']['RuleConfigDto'];

/** Unwrap an openapi-fetch `{ data, error }` result, throwing so React Query sees it. */
function unwrap<T>(result: { data?: T; error?: unknown }, label: string): T {
  if (result.error || result.data === undefined) {
    throw new Error(`Backend request failed: ${label} (${JSON.stringify(result.error)})`);
  }
  return result.data;
}

/** Narrow the DTO `kind` string to the domain `LocationKind`, throwing on unknown. */
function toLocationKind(value: string): LocationKind {
  return locationKindSchema.parse(value);
}

// --- Locations --------------------------------------------------------------

function toLocationMaster(dto: LocationDto): LocationMaster {
  return {
    id: dto.id,
    code: dto.code,
    displayName: dto.displayName,
    kind: toLocationKind(dto.kind),
    zone: dto.zone ?? undefined,
    sequenceIndex: dto.sequenceIndex ?? undefined,
    scanCode: dto.scanCode ?? undefined,
    active: dto.active,
  };
}

/**
 * Project an editor row onto the upsert DTO. New rows carry a temporary client id
 * that the backend ignores (reconciliation is by `code`), so it is not sent.
 */
function toUpsertDto(loc: LocationMaster): LocationUpsertDto {
  return {
    code: loc.code,
    displayName: loc.displayName,
    kind: loc.kind,
    zone: loc.zone ?? null,
    sequenceIndex: loc.sequenceIndex ?? null,
    scanCode: loc.scanCode ?? null,
    active: loc.active,
  };
}

/** §11.2 Read the location master. */
export async function fetchLocations(): Promise<LocationMaster[]> {
  const result = await api.GET('/api/admin/locations');
  const dtos = unwrap<LocationDto[]>(result, 'locations');
  return dtos.map(toLocationMaster);
}

/** §11.2 Replace the whole location master; returns the reconciled list. */
export async function saveLocations(locations: LocationMaster[]): Promise<LocationMaster[]> {
  const body = locations.map(toUpsertDto);
  const result = await api.PUT('/api/admin/locations', { body });
  const dtos = unwrap<LocationDto[]>(result, 'save locations');
  return dtos.map(toLocationMaster);
}

// --- Rule config ------------------------------------------------------------

/**
 * §11 Read the structured rule config. The DTO and the domain `RuleConfig` are the
 * same shape (the DTO is generated from the domain schema), so we validate the
 * payload through `ruleConfigSchema` to get a fully-typed, fail-fast result.
 */
export async function fetchRuleConfig(): Promise<RuleConfig> {
  const result = await api.GET('/api/admin/rules');
  const dto = unwrap<RuleConfigDto>(result, 'rules');
  return ruleConfigSchema.parse(dto);
}

/** §11 Persist the structured rule config; returns the saved (validated) config. */
export async function saveRuleConfig(config: RuleConfig): Promise<RuleConfig> {
  const body = config as RuleConfigDto;
  const result = await api.PUT('/api/admin/rules', { body });
  const dto = unwrap<RuleConfigDto>(result, 'save rules');
  return ruleConfigSchema.parse(dto);
}

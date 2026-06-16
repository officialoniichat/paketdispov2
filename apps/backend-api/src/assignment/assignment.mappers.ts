import type { Location, Shift, GoodsReceiptCase as PrismaCase } from '@prisma/client';
import type {
  EmployeeShift,
  GoodsReceiptCase,
  GoodsTypeText,
  LocationMaster,
  SectionCode,
  StorageLocation,
} from '@paket/domain-types';

const ISO_DATE = (d: Date): string => d.toISOString().slice(0, 10);
const ISO_DATETIME = (d: Date): string => d.toISOString();

/** LocationKind (storage taxonomy) → coarse StorageLocation.type used by the engine. */
function kindToType(kind: Location['kind']): StorageLocation['type'] {
  if (kind.startsWith('palette')) return 'palette';
  switch (kind) {
    case 'regal':
    case 'haengebahn':
    case 'lagerplatz_d':
    case 'workstation':
    case 'printer':
      return kind;
    default:
      return 'regal';
  }
}

export function toLocationMaster(loc: Location): LocationMaster {
  return {
    id: loc.id,
    code: loc.code,
    displayName: loc.displayName,
    kind: loc.kind,
    zone: loc.zone ?? undefined,
    bereich: loc.bereich ?? undefined,
    sequenceIndex: loc.sequenceIndex ?? undefined,
    scanCode: loc.scanCode ?? undefined,
    active: loc.active,
  };
}

export function toStorageLocation(loc: Location): StorageLocation {
  return {
    id: loc.id,
    type: kindToType(loc.kind),
    code: loc.code,
    zone: loc.zone ?? undefined,
    sequenceIndex: loc.sequenceIndex ?? undefined,
    barcode: loc.scanCode ?? undefined,
    active: loc.active,
  };
}

/** Prisma GoodsTypeText (enum identifier) → domain literal (DB value uses a hyphen). */
function toGoodsType(value: PrismaCase['goodsTypeText']): GoodsTypeText | undefined {
  if (value == null) return undefined;
  return (value === 'NOS_Nachorder' ? 'NOS-Nachorder' : value) as GoodsTypeText;
}

export function toEmployeeShift(shift: Shift, bereiche?: string[]): EmployeeShift {
  return {
    id: shift.id,
    employeeId: shift.employeeId,
    date: ISO_DATE(shift.date),
    plannedStart: ISO_DATETIME(shift.plannedStart),
    plannedEnd: ISO_DATETIME(shift.plannedEnd),
    breakMinutes: shift.breakMinutes,
    plannedHours: shift.plannedHours,
    netCapacityMinutes: shift.netCapacityMinutes,
    workstationId: shift.workstationId ?? undefined,
    active: shift.active,
    bereiche: bereiche ?? [],
  };
}

/** Map a pool case (with its storage Location joined) to the engine's domain case. */
export function toGoodsReceiptCase(c: PrismaCase & { storageLocation: Location }): GoodsReceiptCase {
  return {
    id: c.id,
    documentSetId: c.documentSetId,
    weBelegNo: c.weBelegNo,
    deliveryNoteNo: c.deliveryNoteNo ?? undefined,
    bookingDate: ISO_DATE(c.bookingDate),
    weDate: c.weDate ? ISO_DATE(c.weDate) : undefined,
    branchNo: c.branchNo,
    primaryShopAreaNo: c.primaryShopAreaNo ?? undefined,
    primaryFloor: c.primaryFloor ?? undefined,
    storageLocation: toStorageLocation(c.storageLocation),
    section: c.section as SectionCode | null,
    goodsTypeText: toGoodsType(c.goodsTypeText),
    priorityFlags: c.priorityFlags,
    catManDate: c.catManDate ? ISO_DATE(c.catManDate) : undefined,
    loadPlanDate: c.loadPlanDate ? ISO_DATE(c.loadPlanDate) : undefined,
    totalQuantity: c.totalQuantity,
    status: c.status,
    effortPoints: c.effortPoints,
    estimatedMinutes: c.estimatedMinutes,
    assignedBundleId: c.assignedBundleId ?? undefined,
    version: c.version,
  };
}

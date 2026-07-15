/**
 * @paket/ui – shared L&T design-system frontend base (Anhang E.6, §12.2).
 *
 * Exposes: the L&T MUI theme + providers, status chips (Status/Prio/CatMan/
 * Problem/Sync), touch primitives & skeletons, the RHF+Zod form layer and the
 * TanStack Query setup. One import surface for both the Mitarbeiter-App and the
 * Teamlead cockpit.
 */

// Theme & tokens
export {
  ltColors,
  spacing,
  touchTarget,
  statusColor,
  caseStatusMeta,
  priorityMeta,
  issueStatusMeta,
  syncStateMeta,
  type ChipMeta,
  type ChipIconKey,
  type SyncState,
} from './theme/tokens.js';
export {
  problemKindLabels,
  issueScopeLabels,
  locationKindLabels,
  employeeRoleLabels,
  assignmentStatusLabels,
  skuLineStatusLabels,
  zstSourceLabels,
  shiftSourceLabels,
} from './theme/labels.js';
export { ltTheme } from './theme/theme.js';
export { LtThemeProvider, type LtThemeProviderProps } from './theme/LtThemeProvider.js';

// Status chips
export {
  StatusChip,
  CaseStatusChip,
  PriorityChip,
  CatManChip,
  ProblemChip,
  SyncChip,
  type StatusChipProps,
  type PriorityChipProps,
  type CatManChipProps,
  type ProblemChipProps,
  type SyncChipProps,
  type ChipSize,
} from './components/chips.js';

// Touch primitives & skeletons
export {
  TouchButton,
  CaseCardSkeleton,
  ListSkeleton,
  type TouchButtonProps,
  type CaseCardSkeletonProps,
  type ListSkeletonProps,
} from './components/primitives.js';

// Forms (React Hook Form + Zod)
export {
  useZodForm,
  ZodForm,
  RHFTextField,
  RHFNumberField,
  RHFSelectField,
  type ZodFormProps,
  type SelectOption,
  type RHFSelectFieldProps,
} from './forms/forms.js';

// TanStack Query
export {
  createQueryClient,
  QueryProvider,
  AppProviders,
  type QueryClientOverrides,
  type QueryProviderProps,
  type AppProvidersProps,
} from './query/query.js';

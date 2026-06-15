# @paket/ui

Shared L&T design-system frontend base for both surfaces (Mitarbeiter-App + Teamlead-Cockpit).
Reference: Konzept §12.2 (Stack), Anhang E.3/E.4 (UX-Prinzipien), Anhang E.6 (Design-System-Regeln).

## Contents

| Area | Exports |
| --- | --- |
| **Theme** | `ltTheme`, `LtThemeProvider`, design tokens (`ltColors`, `spacing`, `touchTarget`) |
| **Status chips** (E.6) | `StatusChip`/`CaseStatusChip`, `PriorityChip`, `CatManChip`, `ProblemChip`, `SyncChip` |
| **Touch primitives** (E.3) | `TouchButton` (large Next-Best-Action button) |
| **Skeletons** (E.5) | `CaseCardSkeleton`, `ListSkeleton` |
| **Forms** (RHF + Zod) | `useZodForm`, `ZodForm`, `RHFTextField`, `RHFNumberField`, `RHFSelectField` |
| **TanStack Query** | `createQueryClient`, `QueryProvider`, `AppProviders` |

Built on **MUI v6** with a custom L&T theme. Forms validate against the Zod schemas in
`@paket/domain-types` (single source of truth). Query/form data is typed end-to-end with
`@paket/api-client`.

## Design-system rules (E.6)

- **Status chips always pair colour with an icon AND a text label** — never colour alone
  (WCAG 1.4.1). Every chip in this library enforces this.
- **Primary actions are large, thumb-reach buttons** (`TouchButton emphasis="primary"`, ≥64px).
- Skeletons cover the < 200 ms screen-change budget.

## Usage

```tsx
import { AppProviders, StatusChip, TouchButton } from '@paket/ui';

function Root() {
  return (
    <AppProviders>
      <StatusChip status="ready" />
      <TouchButton emphasis="primary">Nächsten Lagerplatz anfahren</TouchButton>
    </AppProviders>
  );
}
```

## Develop

```bash
pnpm --filter @paket/ui storybook        # interactive component gallery (DoD)
pnpm --filter @paket/ui test             # jsdom render tests
pnpm --filter @paket/ui build-storybook  # static Storybook
```

The `apps/employee-pwa` example renders the core components under the theme as a live
"Beispiel" of the base.

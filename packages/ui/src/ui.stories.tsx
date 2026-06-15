import type { Meta, StoryObj } from '@storybook/react-vite';
import { z } from 'zod';
import Stack from '@mui/material/Stack';
import {
  caseStatusMeta,
  priorityMeta,
  issueStatusMeta,
  syncStateMeta,
  StatusChip,
  PriorityChip,
  CatManChip,
  ProblemChip,
  SyncChip,
  TouchButton,
  CaseCardSkeleton,
  ListSkeleton,
  ZodForm,
  RHFTextField,
  RHFNumberField,
  type SyncState,
} from './index.js';
import type { CaseStatus, IssueStatus, PriorityFlag } from '@paket/domain-types';

const meta: Meta = { title: 'Design System/Overview' };
export default meta;
type Story = StoryObj;

/** Every Belegstatus rendered as a chip (colour + text + icon, E.6). */
export const StatusChips: Story = {
  render: () => (
    <Stack direction="row" flexWrap="wrap" gap={1}>
      {(Object.keys(caseStatusMeta) as CaseStatus[]).map((s) => (
        <StatusChip key={s} status={s} />
      ))}
    </Stack>
  ),
};

export const PriorityAndCatMan: Story = {
  render: () => (
    <Stack direction="row" flexWrap="wrap" gap={1}>
      {(Object.keys(priorityMeta) as PriorityFlag[]).map((p) => (
        <PriorityChip key={p} flag={p} />
      ))}
      <CatManChip dueLabel="17.06." />
    </Stack>
  ),
};

export const ProblemChips: Story = {
  render: () => (
    <Stack direction="row" flexWrap="wrap" gap={1}>
      {(Object.keys(issueStatusMeta) as IssueStatus[]).map((s) => (
        <ProblemChip key={s} status={s} />
      ))}
      <ProblemChip status="open" count={4} />
    </Stack>
  ),
};

export const SyncChips: Story = {
  render: () => (
    <Stack direction="row" flexWrap="wrap" gap={1}>
      {(Object.keys(syncStateMeta) as SyncState[]).map((s) => (
        <SyncChip key={s} state={s} />
      ))}
    </Stack>
  ),
};

export const TouchButtons: Story = {
  render: () => (
    <Stack gap={2} maxWidth={360}>
      <TouchButton emphasis="primary">Nächsten Lagerplatz anfahren</TouchButton>
      <TouchButton emphasis="standard" variant="outlined">
        Problem melden
      </TouchButton>
    </Stack>
  ),
};

export const Skeletons: Story = {
  render: () => (
    <Stack gap={2} maxWidth={360}>
      <CaseCardSkeleton count={2} />
      <ListSkeleton rows={4} />
    </Stack>
  ),
};

const exampleSchema = z.object({
  weBelegNo: z.string().min(1, 'Pflichtfeld'),
  totalQuantity: z.number().int().nonnegative(),
});

export const FormExample: Story = {
  render: () => (
    <Stack maxWidth={360}>
      <ZodForm
        schema={exampleSchema}
        defaultValues={{ weBelegNo: '', totalQuantity: 0 }}
        onValidSubmit={(values) => window.alert(JSON.stringify(values))}
      >
        <RHFTextField name="weBelegNo" label="WE-Beleg-Nr." required />
        <RHFNumberField name="totalQuantity" label="Menge gesamt" />
        <TouchButton type="submit" emphasis="primary">
          Speichern
        </TouchButton>
      </ZodForm>
    </Stack>
  ),
};

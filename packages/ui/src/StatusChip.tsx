import type { JSX } from 'react';
import type { CaseStatus } from '@paket/domain-types';
import { statusColor } from './tokens.js';

export interface StatusChipProps {
  status: CaseStatus;
  label?: string;
}

/** Status chip: colour + text, large tap target for warehouse use. */
export function StatusChip({ status, label }: StatusChipProps): JSX.Element {
  const color = statusColor[status] ?? '#374151';
  return (
    <span
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 10px',
        borderRadius: 9999,
        fontSize: 14,
        fontWeight: 600,
        color: '#fff',
        background: color,
      }}
    >
      {label ?? status}
    </span>
  );
}

import type { JSX } from 'react';
import { StatusChip } from '@paket/ui';
import { samplePrioCase } from '@paket/test-fixtures';

const ROLE = 'teamlead';

export function App(): JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <h1>Teamlead/Admin Dashboard</h1>
      <p>Foundation scaffold for the {ROLE} surface.</p>
      <p>
        Sample case {samplePrioCase.weBelegNo}: <StatusChip status={samplePrioCase.status} />
      </p>
    </main>
  );
}

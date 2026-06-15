/**
 * Manual scan fallback (§E.3 "Tastatur nur als Fallback"). Pairs with the global
 * useScanner hook: hardware scans fire through useScanner, typed entry + Enter
 * here covers the fallback path.
 */
import { useState, type JSX } from 'react';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';

export interface ScanFieldProps {
  label: string;
  onSubmit: (code: string) => void;
  placeholder?: string;
  /** Shown under the field, e.g. the expected barcode. */
  hint?: string;
}

export function ScanField({ label, onSubmit, placeholder, hint }: ScanFieldProps): JSX.Element {
  const [value, setValue] = useState('');

  const submit = (): void => {
    const code = value.trim();
    if (code.length === 0) return;
    onSubmit(code);
    setValue('');
  };

  return (
    <Stack spacing={1}>
      <TextField
        label={label}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        fullWidth
        slotProps={{ htmlInput: { inputMode: 'text', 'aria-label': label } }}
      />
      {hint ? (
        <Typography variant="body2" color="text.secondary">
          {hint}
        </Typography>
      ) : null}
      <Button variant="outlined" size="large" onClick={submit} disabled={value.trim().length === 0}>
        Bestätigen
      </Button>
    </Stack>
  );
}

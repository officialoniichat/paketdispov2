/**
 * 9.7 Screen: Problem melden. Always reachable (exception-first, §E.3). The
 * issue is recorded as an `issue.created` event in the local log so the Teamlead
 * inbox sees it; the worker can keep going with "Restware weiter bearbeiten".
 */
import { useState, type JSX } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormControlLabel from '@mui/material/FormControlLabel';
import FormLabel from '@mui/material/FormLabel';
import MenuItem from '@mui/material/MenuItem';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { TouchButton } from '@paket/ui';
import { useCaseFlow } from '../workflow/useCaseFlow.js';

const SCOPES = [
  { value: 'position', label: 'Position' },
  { value: 'sku_line', label: 'SKU' },
  { value: 'transport_box', label: 'ganze Box' },
  { value: 'case', label: 'ganzer Beleg' },
];

const ISSUE_TYPES = [
  { value: 'missing_quantity', label: 'Minderlieferung' },
  { value: 'overdelivery', label: 'Mehrlieferung' },
  { value: 'wrong_article', label: 'falscher Artikel' },
  { value: 'wrong_color', label: 'falsche Farbe' },
  { value: 'wrong_size', label: 'falsche Größe' },
  { value: 'damaged_goods', label: 'beschädigt' },
  { value: 'label_problem', label: 'Etikettenproblem' },
];

export function ProblemMeldenScreen(): JSX.Element {
  const { caseId = '' } = useParams();
  const navigate = useNavigate();
  const flow = useCaseFlow(caseId);
  const [scope, setScope] = useState('position');
  const [issueType, setIssueType] = useState('wrong_color');
  const [comment, setComment] = useState('');

  const send = async (): Promise<void> => {
    await flow.reportIssue({
      caseId,
      scope,
      issueType,
      description: comment.trim() || undefined,
    });
    navigate(-1);
  };

  const weNo = flow.aggregate?.case.weBelegNo ?? '';

  return (
    <Box sx={{ p: 2, pb: 20 }}>
      <Typography variant="overline" color="text.secondary">
        Exception-first
      </Typography>
      <Typography variant="h1" gutterBottom>
        Problem melden
      </Typography>
      <Typography color="text.secondary" gutterBottom>
        Beleg: WE {weNo}
      </Typography>

      <Stack spacing={2} sx={{ mt: 1 }}>
        <TextField select label="Ebene" value={scope} onChange={(e) => setScope(e.target.value)}>
          {SCOPES.map((s) => (
            <MenuItem key={s.value} value={s.value}>
              {s.label}
            </MenuItem>
          ))}
        </TextField>

        <FormControl>
          <FormLabel>Problemtyp</FormLabel>
          <RadioGroup value={issueType} onChange={(e) => setIssueType(e.target.value)}>
            {ISSUE_TYPES.map((t) => (
              <FormControlLabel key={t.value} value={t.value} control={<Radio />} label={t.label} />
            ))}
          </RadioGroup>
        </FormControl>

        <TextField
          label="Kommentar"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          multiline
          minRows={2}
        />
        <Typography variant="body2" color="text.secondary">
          Foto: optional
        </Typography>
      </Stack>

      <Stack
        spacing={1}
        sx={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          p: 2,
          bgcolor: 'background.paper',
          boxShadow: 8,
        }}
      >
        <TouchButton emphasis="primary" onClick={send}>
          An Teamlead senden
        </TouchButton>
        <Button variant="outlined" size="large" fullWidth onClick={() => navigate(-1)}>
          Restware weiter bearbeiten
        </Button>
      </Stack>
    </Box>
  );
}

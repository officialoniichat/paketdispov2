/**
 * Verladeplan-Editor (§11, Teamlead-Punkt 4 — seltene Verladetage).
 *
 * Macht den früher read-only Verladeplan im Admin/Regeln-Bereich bedienbar und
 * transparent. Pro Shop-Bereich (shopAreaNo + Etage): Verladetage als Wochentag-Chips,
 * ein eigener Überfälligkeits-Vorlauf (übersteuert den globalen Standard), ein
 * Kadenz-Vorschlag und eine Live-Vorschau, die zeigt WANN die Schwelle bei diesem Shop
 * greift — der direkte Konter gegen „bei wöchentlichen Verladetagen greift sie nie".
 *
 * Reines Settings-UX: keine eigene Fachlogik. Editiert nur den geteilten RuleConfig-Draft
 * (`loadPlan` + `priority.*`), gespeichert über die gemeinsame „Regeln speichern"-Aktion
 * der {@link ./AdminPage}. Die Engine entscheidet weiterhin allein.
 *
 * Datenmodell-Annahme: alle Zeilen eines (shopAreaNo, floor)-Bereichs teilen
 * Gültigkeit/Sondertag — ein aktiver Wochentag-Chip = genau ein {@link LoadPlanRow}.
 */
import { useState, type JSX } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Collapse from '@mui/material/Collapse';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import type {
  LoadPlanLeadOverride,
  LoadPlanRow,
  RuleConfig,
  SectionCode,
} from '@paket/domain-types';

/** Display order of weekdays; values match the LoadPlanRow.weekday vocabulary. */
const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
/** Weekday label → JS Date.getDay() index (Sunday = 0). */
const WEEKDAY_JS_INDEX: Record<string, number> = {
  So: 0,
  Mo: 1,
  Di: 2,
  Mi: 3,
  Do: 4,
  Fr: 5,
  Sa: 6,
};
/** Verladeplan-relevant warehouse sections (Abschnitt 1/2/3) for advanced overrides. */
const LOAD_PLAN_SECTIONS: readonly SectionCode[] = [1, 2, 3];

const DAY_MS = 86_400_000;

interface VerladeplanTabProps {
  draft: RuleConfig;
  patch: <K extends keyof RuleConfig>(key: K, value: RuleConfig[K]) => void;
}

/** One (shopAreaNo, floor) bucket aggregated from its per-weekday LoadPlanRows. */
interface ShopGroup {
  key: string;
  shopAreaNo: string;
  floor: string;
  weekdays: string[];
  validFrom: string;
  validTo?: string;
  specialDay: boolean;
}

export function VerladeplanTab({ draft, patch }: VerladeplanTabProps): JSX.Element {
  const groups = groupRows(draft.loadPlan);

  function setLoadPlan(rows: LoadPlanRow[]): void {
    patch('loadPlan', rows);
  }

  function setOverrides(overrides: LoadPlanLeadOverride[]): void {
    patch('priority', { ...draft.priority, overdueLeadDaysOverrides: overrides });
  }

  function toggleWeekday(group: ShopGroup, weekday: string): void {
    const active = group.weekdays.includes(weekday);
    if (active) {
      setLoadPlan(
        draft.loadPlan.filter(
          (r) =>
            !(r.shopAreaNo === group.shopAreaNo && r.floor === group.floor && r.weekday === weekday),
        ),
      );
      return;
    }
    const row: LoadPlanRow = {
      id: rowId(group.shopAreaNo, group.floor, weekday),
      shopAreaNo: group.shopAreaNo,
      floor: group.floor,
      weekday,
      validFrom: group.validFrom,
      ...(group.validTo !== undefined ? { validTo: group.validTo } : {}),
      specialDay: group.specialDay,
    };
    setLoadPlan([...draft.loadPlan, row]);
  }

  /** Apply a shared field (validity/specialDay) to every row of the group. */
  function patchGroupRows(group: ShopGroup, change: Partial<LoadPlanRow>): void {
    setLoadPlan(
      draft.loadPlan.map((r) =>
        r.shopAreaNo === group.shopAreaNo && r.floor === group.floor ? sanitizeRow({ ...r, ...change }) : r,
      ),
    );
  }

  /** Rename a group's shopAreaNo/floor on every row (and re-key its overrides). */
  function renameGroup(group: ShopGroup, next: { shopAreaNo?: string; floor?: string }): void {
    const shopAreaNo = next.shopAreaNo ?? group.shopAreaNo;
    const floor = next.floor ?? group.floor;
    setLoadPlan(
      draft.loadPlan.map((r) =>
        r.shopAreaNo === group.shopAreaNo && r.floor === group.floor
          ? { ...r, shopAreaNo, floor, id: rowId(shopAreaNo, floor, r.weekday) }
          : r,
      ),
    );
    if (next.shopAreaNo !== undefined && next.shopAreaNo !== group.shopAreaNo) {
      setOverrides(
        draft.priority.overdueLeadDaysOverrides.map((o) =>
          o.shopAreaNo === group.shopAreaNo ? { ...o, shopAreaNo } : o,
        ),
      );
    }
  }

  function removeGroup(group: ShopGroup): void {
    setLoadPlan(
      draft.loadPlan.filter((r) => !(r.shopAreaNo === group.shopAreaNo && r.floor === group.floor)),
    );
    setOverrides(
      draft.priority.overdueLeadDaysOverrides.filter((o) => o.shopAreaNo !== group.shopAreaNo),
    );
  }

  function addGroup(): void {
    const shopAreaNo = nextAreaNo(draft.loadPlan);
    setLoadPlan([
      ...draft.loadPlan,
      {
        id: rowId(shopAreaNo, 'EG', 'Mo'),
        shopAreaNo,
        floor: 'EG',
        weekday: 'Mo',
        validFrom: todayISO(),
        specialDay: false,
      },
    ]);
  }

  /** Upsert/remove the area-level (section-less) Vorlauf override. */
  function setAreaLead(shopAreaNo: string, leadDays: number | null): void {
    const rest = draft.priority.overdueLeadDaysOverrides.filter(
      (o) => !(o.shopAreaNo === shopAreaNo && o.section === undefined),
    );
    setOverrides(leadDays === null ? rest : [...rest, { shopAreaNo, leadDays }]);
  }

  return (
    <Stack spacing={2}>
      <Typography variant="body2" color="text.secondary">
        Pro Shop-Bereich &amp; Etage: an welchen Wochentagen verladen wird, ab wann der Plan gilt, und
        wie viele Tage vorher die Ware als überfällig vorgezogen wird. Der globale Vorlauf gilt
        überall, wo kein eigener Wert gesetzt ist — er greift auch bei seltenen (z. B. wöchentlichen)
        Verladetagen.
      </Typography>

      <Paper
        variant="outlined"
        sx={{ p: 1.5, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}
      >
        <Typography variant="body2" sx={{ fontWeight: 700, color: 'text.secondary' }}>
          Globaler Überfälligkeits-Vorlauf
        </Typography>
        <TextField
          type="number"
          size="small"
          value={draft.priority.overdueLeadDays}
          onChange={(e) =>
            patch('priority', {
              ...draft.priority,
              overdueLeadDays: Math.max(0, Math.round(Number(e.target.value))),
            })
          }
          inputProps={{ min: 0, step: 1, style: { width: 56 } }}
          helperText="Tage"
          sx={{ '& .MuiFormHelperText-root': { m: 0, textAlign: 'center' } }}
        />
        <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 460 }}>
          Standard für alle Shop-Bereiche ohne eigenen Wert. Mit <strong>0</strong> gilt ein Beleg
          erst am Verladetag selbst als fällig.
        </Typography>
      </Paper>

      {groups.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Noch kein Verladeplan hinterlegt.
        </Typography>
      )}

      {groups.map((group) => (
        <ShopAreaCard
          key={group.key}
          group={group}
          globalLeadDays={draft.priority.overdueLeadDays}
          overrides={draft.priority.overdueLeadDaysOverrides}
          onToggleWeekday={(wd) => toggleWeekday(group, wd)}
          onPatchRows={(change) => patchGroupRows(group, change)}
          onRename={(next) => renameGroup(group, next)}
          onRemove={() => removeGroup(group)}
          onSetAreaLead={(lead) => setAreaLead(group.shopAreaNo, lead)}
          onSetOverrides={setOverrides}
        />
      ))}

      <Box>
        <Button variant="outlined" onClick={addGroup}>
          + Shop-Bereich hinzufügen
        </Button>
      </Box>
    </Stack>
  );
}

interface ShopAreaCardProps {
  group: ShopGroup;
  globalLeadDays: number;
  overrides: LoadPlanLeadOverride[];
  onToggleWeekday: (weekday: string) => void;
  onPatchRows: (change: Partial<LoadPlanRow>) => void;
  onRename: (next: { shopAreaNo?: string; floor?: string }) => void;
  onRemove: () => void;
  onSetAreaLead: (leadDays: number | null) => void;
  onSetOverrides: (overrides: LoadPlanLeadOverride[]) => void;
}

function ShopAreaCard({
  group,
  globalLeadDays,
  overrides,
  onToggleWeekday,
  onPatchRows,
  onRename,
  onRemove,
  onSetAreaLead,
  onSetOverrides,
}: ShopAreaCardProps): JSX.Element {
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const dayCount = group.weekdays.length;
  const areaOverride = overrides.find((o) => o.shopAreaNo === group.shopAreaNo && o.section === undefined);
  const effectiveLead = areaOverride?.leadDays ?? globalLeadDays;
  const suggestion = suggestLeadDays(dayCount);
  const sectionOverrides = overrides.filter(
    (o) => o.shopAreaNo === group.shopAreaNo && o.section !== undefined,
  );
  const preview = computePreview(group.weekdays, effectiveLead);
  const isRare = dayCount === 1;

  return (
    <Paper
      variant="outlined"
      sx={{ p: 0, overflow: 'hidden', borderColor: isRare ? 'warning.light' : 'divider' }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          p: 1.5,
          bgcolor: 'grey.50',
          borderBottom: '1px solid',
          borderColor: 'divider',
          flexWrap: 'wrap',
        }}
      >
        <TextField
          size="small"
          label="Shop-Bereich"
          value={group.shopAreaNo}
          onChange={(e) => onRename({ shopAreaNo: e.target.value })}
          inputProps={{ style: { width: 80, fontWeight: 700 } }}
        />
        <TextField
          size="small"
          label="Etage"
          value={group.floor}
          onChange={(e) => onRename({ floor: e.target.value })}
          inputProps={{ style: { width: 64 } }}
        />
        <Chip
          size="small"
          color={dayCount === 0 ? 'default' : isRare ? 'warning' : 'success'}
          variant={isRare ? 'filled' : 'outlined'}
          label={
            dayCount === 0
              ? 'kein Verladetag'
              : isRare
                ? '⚠ 1 Verladetag / Woche'
                : `${dayCount} Verladetage / Woche`
          }
        />
        <Button color="error" size="small" onClick={onRemove} sx={{ ml: 'auto' }}>
          Entfernen
        </Button>
      </Box>

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: '1.15fr 1fr' },
          gap: 0,
        }}
      >
        <Box sx={{ p: 2, borderRight: { md: '1px solid' }, borderColor: { md: 'divider' } }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            Verladetage
          </Typography>
          <Stack direction="row" spacing={0.75} sx={{ mt: 0.5, mb: 2, flexWrap: 'wrap', rowGap: 0.75 }}>
            {WEEKDAYS.map((wd) => {
              const on = group.weekdays.includes(wd);
              return (
                <Chip
                  key={wd}
                  label={wd}
                  onClick={() => onToggleWeekday(wd)}
                  color={on ? 'primary' : 'default'}
                  variant={on ? 'filled' : 'outlined'}
                  sx={{ fontWeight: 700, width: 46 }}
                />
              );
            })}
          </Stack>
          <Stack direction="row" spacing={1.5} sx={{ flexWrap: 'wrap', rowGap: 1.5 }}>
            <TextField
              type="date"
              size="small"
              label="Gültig ab"
              InputLabelProps={{ shrink: true }}
              value={group.validFrom}
              onChange={(e) => onPatchRows({ validFrom: e.target.value })}
            />
            <TextField
              type="date"
              size="small"
              label="Gültig bis (optional)"
              InputLabelProps={{ shrink: true }}
              value={group.validTo ?? ''}
              onChange={(e) => onPatchRows({ validTo: e.target.value === '' ? undefined : e.target.value })}
            />
          </Stack>
          <Chip
            size="small"
            label="Sondertag (einmalige Abweichung)"
            onClick={() => onPatchRows({ specialDay: !group.specialDay })}
            color={group.specialDay ? 'warning' : 'default'}
            variant={group.specialDay ? 'filled' : 'outlined'}
            sx={{ mt: 1.5 }}
          />
        </Box>

        <Box sx={{ p: 2 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            Überfälligkeits-Vorlauf für diesen Shop
          </Typography>
          <Paper variant="outlined" sx={{ p: 1.5, mt: 0.5, bgcolor: 'grey.50' }}>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 1 }}>
              <TextField
                type="number"
                size="small"
                placeholder={String(globalLeadDays)}
                value={areaOverride?.leadDays ?? ''}
                onChange={(e) =>
                  onSetAreaLead(
                    e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))),
                  )
                }
                inputProps={{ min: 0, step: 1, style: { width: 56 } }}
                helperText="Tage"
                sx={{ '& .MuiFormHelperText-root': { m: 0, textAlign: 'center' } }}
              />
              <Typography variant="caption" color="text.secondary">
                {areaOverride
                  ? `eigener Wert · übersteuert den globalen Standard (${globalLeadDays})`
                  : `kein eigener Wert · globaler Standard (${globalLeadDays}) gilt`}
              </Typography>
            </Stack>
            {suggestion !== null && (
              <Box
                sx={{
                  mt: 1.25,
                  p: 1,
                  borderRadius: 1,
                  bgcolor: 'warning.50',
                  border: '1px solid',
                  borderColor: 'warning.light',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  flexWrap: 'wrap',
                }}
              >
                <Typography variant="caption" sx={{ color: 'warning.dark' }}>
                  Kadenz <strong>{cadenceLabel(dayCount)}</strong> erkannt → empfohlen{' '}
                  <strong>{suggestion} Tage</strong>
                </Typography>
                <Button
                  size="small"
                  color="warning"
                  variant="contained"
                  onClick={() => onSetAreaLead(suggestion)}
                  disabled={areaOverride?.leadDays === suggestion}
                  sx={{ ml: 'auto' }}
                >
                  Übernehmen
                </Button>
              </Box>
            )}
            <Button
              size="small"
              onClick={() => setAdvancedOpen((o) => !o)}
              sx={{ mt: 0.5, textTransform: 'none' }}
            >
              {advancedOpen ? '▾' : '▸'} Erweitert: Vorlauf je Abschnitt (1 / 2 / 3)
            </Button>
            <Collapse in={advancedOpen}>
              <SectionOverrideEditor
                shopAreaNo={group.shopAreaNo}
                overrides={overrides}
                sectionOverrides={sectionOverrides}
                onSetOverrides={onSetOverrides}
              />
            </Collapse>
          </Paper>

          <PreviewBox preview={preview} />
        </Box>
      </Box>
    </Paper>
  );
}

interface SectionOverrideEditorProps {
  shopAreaNo: string;
  overrides: LoadPlanLeadOverride[];
  sectionOverrides: LoadPlanLeadOverride[];
  onSetOverrides: (overrides: LoadPlanLeadOverride[]) => void;
}

function SectionOverrideEditor({
  shopAreaNo,
  overrides,
  sectionOverrides,
  onSetOverrides,
}: SectionOverrideEditorProps): JSX.Element {
  const usedSections = new Set(sectionOverrides.map((o) => o.section));
  const freeSection = LOAD_PLAN_SECTIONS.find((s) => !usedSections.has(s));

  function updateSection(section: SectionCode, leadDays: number): void {
    onSetOverrides(
      overrides.map((o) =>
        o.shopAreaNo === shopAreaNo && o.section === section ? { ...o, leadDays } : o,
      ),
    );
  }

  function removeSection(section: SectionCode): void {
    onSetOverrides(
      overrides.filter((o) => !(o.shopAreaNo === shopAreaNo && o.section === section)),
    );
  }

  function addSection(): void {
    if (freeSection === undefined) return;
    onSetOverrides([...overrides, { shopAreaNo, section: freeSection, leadDays: 0 }]);
  }

  return (
    <Stack spacing={1} sx={{ mt: 1 }}>
      <Divider />
      <Typography variant="caption" color="text.secondary">
        Abschnittsfeiner Vorlauf für Shop {shopAreaNo} (übersteuert den Shop-Wert für den jeweiligen
        Abschnitt).
      </Typography>
      {sectionOverrides.length === 0 && (
        <Typography variant="caption" color="text.disabled">
          Keine abschnittsfeinen Ausnahmen.
        </Typography>
      )}
      {sectionOverrides.map((o) => (
        <Stack key={o.section} direction="row" spacing={1} alignItems="center">
          <TextField
            select
            size="small"
            label="Abschnitt"
            value={o.section}
            onChange={(e) => {
              removeSection(o.section as SectionCode);
              onSetOverrides([
                ...overrides.filter((x) => !(x.shopAreaNo === shopAreaNo && x.section === o.section)),
                { shopAreaNo, section: Number(e.target.value) as SectionCode, leadDays: o.leadDays },
              ]);
            }}
            sx={{ width: 110 }}
          >
            {LOAD_PLAN_SECTIONS.map((s) => (
              <MenuItem key={s} value={s} disabled={usedSections.has(s) && s !== o.section}>
                Abschnitt {s}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            type="number"
            size="small"
            label="Vorlauf (Tage)"
            value={o.leadDays}
            onChange={(e) =>
              updateSection(o.section as SectionCode, Math.max(0, Math.round(Number(e.target.value))))
            }
            inputProps={{ min: 0, step: 1, style: { width: 64 } }}
          />
          <Button color="error" size="small" onClick={() => removeSection(o.section as SectionCode)}>
            Entfernen
          </Button>
        </Stack>
      ))}
      {freeSection !== undefined && (
        <Box>
          <Button size="small" onClick={addSection}>
            + Abschnitt-Ausnahme
          </Button>
        </Box>
      )}
    </Stack>
  );
}

interface Preview {
  hasPlan: boolean;
  nextLoad?: string;
  dueFrom?: string;
  overdueFrom?: string;
  status: 'calm' | 'soon' | 'none';
  daysUntilWindow?: number;
}

function PreviewBox({ preview }: { preview: Preview }): JSX.Element {
  return (
    <Box
      sx={{
        mt: 1.5,
        p: 1.5,
        borderRadius: 1,
        border: '1px dashed',
        borderColor: 'divider',
        bgcolor: 'background.paper',
      }}
    >
      <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
        Vorschau — Wirkung heute ({formatDe(new Date())})
      </Typography>
      {!preview.hasPlan ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          Kein Verladetag hinterlegt — diese Belege werden nicht über den Verladeplan überfällig.
        </Typography>
      ) : (
        <Stack spacing={0.25} sx={{ mt: 0.5 }}>
          <PreviewLine k="Nächster Verladetag (ab heute)" v={preview.nextLoad ?? '—'} />
          <PreviewLine k="Wird dringend ab" v={preview.dueFrom ?? '—'} />
          <PreviewLine k="Überfällig ab" v={preview.overdueFrom ?? '—'} />
          <Box sx={{ mt: 1 }}>
            <Chip
              size="small"
              color={preview.status === 'soon' ? 'warning' : 'info'}
              variant={preview.status === 'soon' ? 'filled' : 'outlined'}
              label={
                preview.status === 'soon'
                  ? '● Im Vorlauf-Fenster — wird heute vorgezogen'
                  : `● Noch ruhig — Vorlauf-Fenster öffnet in ${preview.daysUntilWindow} Tag(en)`
              }
            />
          </Box>
        </Stack>
      )}
    </Box>
  );
}

function PreviewLine({ k, v }: { k: string; v: string }): JSX.Element {
  return (
    <Stack direction="row" spacing={1} sx={{ fontSize: 13 }}>
      <Typography variant="body2" color="text.secondary" sx={{ width: 210, flexShrink: 0 }}>
        {k}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700, fontFamily: 'ui-monospace, Menlo, monospace' }}>
        {v}
      </Typography>
    </Stack>
  );
}

// ── pure helpers ────────────────────────────────────────────────────────────

/** Aggregate the flat LoadPlanRow list into one bucket per (shopAreaNo, floor). */
function groupRows(rows: readonly LoadPlanRow[]): ShopGroup[] {
  const map = new Map<string, ShopGroup>();
  for (const r of rows) {
    const key = `${r.shopAreaNo}__${r.floor}`;
    const existing = map.get(key);
    if (existing) {
      existing.weekdays.push(r.weekday);
    } else {
      map.set(key, {
        key,
        shopAreaNo: r.shopAreaNo,
        floor: r.floor,
        weekdays: [r.weekday],
        validFrom: r.validFrom,
        ...(r.validTo !== undefined ? { validTo: r.validTo } : {}),
        specialDay: r.specialDay,
      });
    }
  }
  for (const g of map.values()) {
    g.weekdays.sort((a, b) => WEEKDAYS.indexOf(a as never) - WEEKDAYS.indexOf(b as never));
  }
  return [...map.values()].sort(
    (a, b) => a.shopAreaNo.localeCompare(b.shopAreaNo) || a.floor.localeCompare(b.floor),
  );
}

/** Deterministic, collision-free row id (one row per area/floor/weekday). */
function rowId(shopAreaNo: string, floor: string, weekday: string): string {
  return `lp-${shopAreaNo}-${floor}-${weekday}`;
}

/** Drop an undefined validTo so the row stays schema-clean (optional field). */
function sanitizeRow(row: LoadPlanRow): LoadPlanRow {
  if (row.validTo !== undefined) return row;
  const { validTo: _omit, ...rest } = row;
  return rest;
}

function nextAreaNo(rows: readonly LoadPlanRow[]): string {
  const nums = rows
    .map((r) => Number(r.shopAreaNo))
    .filter((n) => Number.isFinite(n));
  const max = nums.length > 0 ? Math.max(...nums) : 20;
  return String(max + 1);
}

/** UI-only Vorlauf suggestion from the weekly cadence; null = no suggestion. */
function suggestLeadDays(dayCount: number): number | null {
  if (dayCount <= 0) return null;
  const cadenceDays = 7 / dayCount;
  const upper = Math.max(1, Math.ceil(cadenceDays) - 1);
  return Math.min(Math.max(Math.round(cadenceDays / 2), 1), upper);
}

function cadenceLabel(dayCount: number): string {
  if (dayCount <= 0) return '—';
  if (dayCount === 1) return '7 Tage';
  return `~${Math.round(7 / dayCount)} Tage`;
}

function computePreview(weekdays: readonly string[], leadDays: number): Preview {
  if (weekdays.length === 0) return { hasPlan: false, status: 'none' };
  const today = startOfDay(new Date());
  const next = earliestNextWeekday(today, weekdays);
  if (next === null) return { hasPlan: false, status: 'none' };
  const dueFrom = addDays(next, -leadDays);
  const overdueFrom = addDays(next, 1);
  const inWindow = today.getTime() >= dueFrom.getTime();
  return {
    hasPlan: true,
    nextLoad: formatDe(next),
    dueFrom: formatDe(dueFrom),
    overdueFrom: formatDe(overdueFrom),
    status: inWindow ? 'soon' : 'calm',
    daysUntilWindow: inWindow ? 0 : Math.round((dueFrom.getTime() - today.getTime()) / DAY_MS),
  };
}

/** Earliest upcoming date (≥ from) that falls on one of the given weekdays. */
function earliestNextWeekday(from: Date, weekdays: readonly string[]): Date | null {
  let best: Date | null = null;
  for (const wd of weekdays) {
    const idx = WEEKDAY_JS_INDEX[wd];
    if (idx === undefined) continue;
    const candidate = nextWeekdayOnOrAfter(from, idx);
    if (best === null || candidate.getTime() < best.getTime()) best = candidate;
  }
  return best;
}

function nextWeekdayOnOrAfter(from: Date, jsIndex: number): Date {
  const d = startOfDay(from);
  const delta = (jsIndex - d.getDay() + 7) % 7;
  return addDays(d, delta);
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function todayISO(): string {
  const d = startOfDay(new Date());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function formatDe(d: Date): string {
  return new Intl.DateTimeFormat('de-DE', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(d);
}

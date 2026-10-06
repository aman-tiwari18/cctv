import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, IconButton,
  InputAdornment, MenuItem, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { Close, DeleteOutline, Download, EventAvailable, GridOn, Search, TuneOutlined, UploadFile } from '@mui/icons-material';
import { examsAPI } from '../../services/api';

/*
 * Exam schedule + server-room thresholds, shown in the Exams → edit dialog.
 * Docs: backend/docs/EXAM_SCHEDULE_AND_THRESHOLDS.md
 *
 *   1. Exam date & shift schedule   (exam level, RTSP + HLS)   — which dates/shifts the exam runs
 *   2. Centre-wise schedule          (RTSP exams only)          — which centres run in which date + shift
 *   3. Server room thresholds        (RTSP + HLS)               — person limit per centre
 *
 * Every upload is previewed first (nothing is saved until the admin confirms); every error the
 * backend reports — a bad cell, a missing shift, a wrong file — is shown as written.
 */

const BLUE = '#3c81f6';
const INK = '#1e293b';
const MUTED = '#64748b';

// ── helpers ──────────────────────────────────────────────────────────────────
/** { message, errors[] } from an axios error, whatever the failure was (server, network, timeout). */
export function describeError(e, fallback) {
  const d = e?.response?.data;
  if (d?.message || d?.errors) return { message: d.message || fallback, errors: d.errors || [] };
  if (e?.response?.status === 413) return { message: 'The file is too large (max 10 MB).', errors: [] };
  if (e?.response?.status === 401 || e?.response?.status === 403) return { message: 'You are not allowed to do this (sign in again as an admin).', errors: [] };
  if (e?.code === 'ECONNABORTED') return { message: 'The server took too long to answer. Try again.', errors: [] };
  if (!e?.response) return { message: 'Could not reach the server. Check your connection and try again.', errors: [] };
  return { message: `${fallback} (${e.response.status})`, errors: [] };
}

async function saveBlob(promise, filename, onError) {
  try {
    const res = await promise;
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  } catch (e) {
    // a blob error body is a Blob, not JSON — read it so the real reason is shown
    let msg = 'The download failed.';
    try { const t = await e.response?.data?.text?.(); if (t) msg = JSON.parse(t).message || msg; } catch { /* keep default */ }
    onError?.(msg);
  }
}

const fmtDay = (iso) => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const fmtWhen = (v) => (v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');

const cardSx = { p: 2, bgcolor: '#f8fafc', borderRadius: 3, mb: 1.5 };
const btnSx = {
  bgcolor: '#ffffff', color: BLUE, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none', borderRadius: 2, px: 2,
  border: '1px solid #e2e8f0', '&:hover': { bgcolor: '#f1f5f9' },
};
const dangerSx = { ...btnSx, color: '#dc2626' };

function Heading({ children, right }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, mt: 3 }}>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ width: 3, height: 14, bgcolor: BLUE, mr: 1, borderRadius: 1 }} />
        <Typography sx={{ fontWeight: 800, fontSize: '0.85rem', letterSpacing: '0.05em', color: INK }}>{children}</Typography>
      </Box>
      {right}
    </Box>
  );
}

function ErrorList({ title, items, severity, max = 40 }) {
  if (!items?.length) return null;
  return (
    <Alert severity={severity} sx={{ mb: 1.5, '& .MuiAlert-message': { width: '100%' } }}>
      <Typography sx={{ fontWeight: 700, fontSize: '0.8rem', mb: 0.5 }}>{title} ({items.length})</Typography>
      <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.78rem', maxHeight: 180, overflow: 'auto' }}>
        {items.slice(0, max).map((x, i) => <li key={i}>{x}</li>)}
        {items.length > max && <li>… and {items.length - max} more</li>}
      </Box>
    </Alert>
  );
}

// ── upload preview: validate first, save only on Confirm ─────────────────────
function UploadPreviewDialog({ open, title, file, upload, onClose, onSaved }) {
  const [state, setState] = useState({ loading: true });
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState(null);

  useEffect(() => {
    if (!open || !file) return undefined;
    let live = true;
    setState({ loading: true }); setSaveErr(null);
    upload(file, true)
      .then((r) => live && setState({ result: r.data }))
      .catch((e) => live && setState({ failure: describeError(e, 'The file could not be checked') }));
    return () => { live = false; };
  }, [open, file]); // eslint-disable-line react-hooks/exhaustive-deps

  const confirm = async () => {
    setSaving(true); setSaveErr(null);
    try {
      const r = await upload(file, false);
      onSaved?.(r.data);
      onClose();
    } catch (e) {
      setSaveErr(describeError(e, 'Saving failed'));
    } finally { setSaving(false); }
  };

  const r = state.result;
  const failure = state.failure;
  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {title}
        <IconButton onClick={onClose} disabled={saving} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography sx={{ fontSize: '0.8rem', color: MUTED, mb: 1.5 }}>File: <b>{file?.name}</b> — checked first, nothing is saved until you confirm.</Typography>
        {state.loading && <Box sx={{ py: 4, textAlign: 'center' }}><CircularProgress size={28} /><Typography sx={{ mt: 1, fontSize: '0.8rem' }}>Checking the sheet…</Typography></Box>}
        {failure && (
          <>
            <Alert severity="error" sx={{ mb: 1.5 }}>{failure.message}</Alert>
            <ErrorList title="Details" items={failure.errors} severity="error" />
          </>
        )}
        {r && (
          <>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1.5 }}>
              {summaryChips(r.summary).map(([k, v]) => <Chip key={k} size="small" label={`${k}: ${v}`} sx={{ fontWeight: 700 }} />)}
            </Box>
            <ErrorList title="Errors — fix these in the sheet and upload again" items={r.errors} severity="error" />
            <ErrorList title="Warnings — you can still save" items={r.warnings} severity="warning" />
            {!r.errors?.length && !r.warnings?.length && <Alert severity="success">The sheet looks good.</Alert>}
          </>
        )}
        {saveErr && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {saveErr.message}
            <ErrorList title="Details" items={saveErr.errors} severity="error" />
          </Alert>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={confirm} disabled={saving || state.loading || !r || !r.can_commit}
          startIcon={saving ? <CircularProgress size={14} /> : null} sx={{ textTransform: 'none', fontWeight: 700 }}>
          {saving ? 'Saving…' : 'Confirm & save'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function summaryChips(s) {
  if (!s) return [];
  const out = [];
  const add = (k, v) => { if (v !== undefined && v !== null) out.push([k, v]); };
  add('centres', s.centres); add('dates', s.dates); add('slots', s.slots); add('rows', s.rows);
  add('running', s.running ?? s.running_cells); add('not running', s.not_running ?? s.not_running_cells);
  add('layout', s.shape);
  if (s.min !== undefined && s.max !== undefined) add('limits', `${s.min} – ${s.max}`);
  return out;
}

// ── one upload row: pick file → preview → confirm ────────────────────────────
function useSheetPicker(onPicked) {
  const [file, setFile] = useState(null);
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) { setFile(f); onPicked?.(f); }
  };
  return { file, pick, clear: () => setFile(null) };
}

function PickButton({ onPick, disabled, children = 'Upload Excel' }) {
  return (
    <Button component="label" disabled={disabled} startIcon={<UploadFile sx={{ fontSize: 16 }} />} sx={btnSx}>
      {children}
      <input type="file" hidden accept=".xlsx,.xls,.ods" onChange={onPick} />
    </Button>
  );
}

// ── centre matrix ────────────────────────────────────────────────────────────
function CentreScheduleDialog({ open, examId, onClose, onChanged, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('');
  const [menu, setMenu] = useState(null);   // { slot, x, y }
  const LIMIT = 300;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData((await examsAPI.getCentreSchedule(examId)).data); }
    catch (e) { setError(describeError(e, 'Could not load the schedule')); }
    finally { setLoading(false); }
  }, [examId]);
  useEffect(() => { if (open) load(); }, [open, load]);

  const shiftName = useMemo(() => Object.fromEntries((data?.shifts || []).map((s) => [s.id, s.name])), [data]);
  const regions = useMemo(() => [...new Set((data?.centres || []).map((c) => c.region).filter(Boolean))].sort(), [data]);
  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.centres || []).filter((c) => (!region || c.region === region)
      && (!q || c.tc_code.toLowerCase().includes(q) || (c.centre_name || '').toLowerCase().includes(q) || (c.city || '').toLowerCase().includes(q)));
  }, [data, search, region]);
  const groups = useMemo(() => {
    const g = [];
    (data?.slots || []).forEach((s) => { const last = g[g.length - 1]; if (last && last.date === s.date) last.n += 1; else g.push({ date: s.date, n: 1 }); });
    return g;
  }, [data]);

  const toggle = async (c, slot) => {
    const key = `${slot.date}#${slot.shift_id}`;
    const now = c.cells[key] > 0;
    setData((d) => ({ ...d, centres: d.centres.map((x) => (x.tc_code === c.tc_code ? { ...x, cells: { ...x.cells, [key]: now ? -1 : 2 } } : x)) }));
    try {
      await examsAPI.setCentreCell(examId, { tc_code: c.tc_code, date: slot.date, shift_id: slot.shift_id, is_running: !now });
      onChanged?.();
    } catch (e) {
      setData((d) => ({ ...d, centres: d.centres.map((x) => (x.tc_code === c.tc_code ? { ...x, cells: { ...x.cells, [key]: c.cells[key] } } : x)) }));
      notify(describeError(e, 'Could not change the cell').message, 'error');
    }
  };
  const setAll = async (slot, running) => {
    setMenu(null);
    try {
      await examsAPI.setCentreCell(examId, { date: slot.date, shift_id: slot.shift_id, is_running: running, all: true });
      await load(); onChanged?.();
    } catch (e) { notify(describeError(e, 'Could not change the column').message, 'error'); }
  };

  const cell = (v) => (v > 0 ? ['YES', '#dcfce7', '#166534'] : v === undefined ? ['·', '#f1f5f9', '#94a3b8'] : ['NO', '#fee2e2', '#991b1b']);
  const stick = (left, extra = {}) => ({ position: 'sticky', left, bgcolor: '#fff', zIndex: 2, ...extra });

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xl" fullWidth PaperProps={{ sx: { height: '90vh' } }}>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Centre schedule{data?.exam ? ` — ${data.exam.name}` : ''}
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0' }}>
          <TextField size="small" placeholder="Search TC code, centre, city" value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} sx={{ minWidth: 260 }} />
          <TextField select size="small" label="Region" value={region} onChange={(e) => setRegion(e.target.value)} sx={{ minWidth: 120 }}>
            <MenuItem value="">All</MenuItem>
            {regions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
          </TextField>
          <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>Click a cell to switch YES / NO · click a column's count to set the whole column · bold border = changed by hand · · = not in the sheet (does not run)</Typography>
        </Box>
        {error && <Alert severity="error" sx={{ m: 1.5 }} action={<Button size="small" onClick={load}>Retry</Button>}>{error.message}</Alert>}
        {loading && !data && <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>}
        {data && !data.has_schedule && <Alert severity="info" sx={{ m: 1.5 }}>No centre schedule uploaded yet — every centre runs in every shift. Upload the Excel sheet first.</Alert>}
        {data?.has_schedule && (
          <Box sx={{ overflow: 'auto', flex: 1 }}>
            <Table size="small" stickyHeader sx={{ '& td, & th': { px: 0.75, py: 0.4, fontSize: '0.72rem', whiteSpace: 'nowrap', borderRight: '1px solid #f1f5f9' } }}>
              <TableHead>
                <TableRow>
                  <TableCell rowSpan={3} sx={{ ...stick(0, { zIndex: 4, minWidth: 80, fontWeight: 800 }) }}>TC code</TableCell>
                  <TableCell rowSpan={3} sx={{ ...stick(80, { zIndex: 4, minWidth: 220, fontWeight: 800 }) }}>Centre</TableCell>
                  <TableCell rowSpan={3} align="right" sx={{ fontWeight: 800 }}>Cams</TableCell>
                  {groups.map((g) => <TableCell key={g.date} colSpan={g.n} align="center" sx={{ fontWeight: 800 }}>{fmtDay(g.date)}</TableCell>)}
                </TableRow>
                <TableRow>
                  {data.slots.map((s) => <TableCell key={`${s.date}${s.shift_id}`} align="center" sx={{ fontWeight: 700 }}>{String(shiftName[s.shift_id] || s.shift_id).replace(/shift\s*/i, 'S')}</TableCell>)}
                </TableRow>
                <TableRow>
                  {data.slots.map((s) => {
                    const t = data.totals[`${s.date}#${s.shift_id}`] || { centres: 0, cameras: 0 };
                    return (
                      <Tooltip key={`${s.date}${s.shift_id}`} arrow title={`${t.centres} centres · ${t.cameras} cameras run. Click to set the whole column.`}>
                        <TableCell align="center" onClick={(e) => setMenu({ slot: s, x: e.clientX, y: e.clientY })}
                          sx={{ cursor: 'pointer', color: t.centres ? '#166534' : '#991b1b', fontWeight: 800, bgcolor: '#f8fafc' }}>{t.centres}</TableCell>
                      </Tooltip>
                    );
                  })}
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.slice(0, LIMIT).map((c) => (
                  <TableRow key={c.tc_code} hover>
                    <TableCell sx={stick(0, { fontWeight: 700 })}>{c.tc_code}</TableCell>
                    <TableCell sx={stick(80, { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' })} title={`${c.centre_name || ''} ${c.city || ''}`}>{c.centre_name || '—'}</TableCell>
                    <TableCell align="right" sx={{ color: MUTED }}>{c.cameras}</TableCell>
                    {data.slots.map((s) => {
                      const v = c.cells[`${s.date}#${s.shift_id}`];
                      const [label, bg, fg] = cell(v);
                      return (
                        <TableCell key={`${s.date}${s.shift_id}`} align="center" onClick={() => toggle(c, s)}
                          sx={{ cursor: 'pointer', bgcolor: bg, color: fg, fontWeight: 700, outline: Math.abs(v || 0) === 2 || v === -1 ? `2px solid ${fg}` : 'none', outlineOffset: -2, userSelect: 'none' }}>
                          {label}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > LIMIT && <Typography sx={{ p: 1.5, fontSize: '0.78rem', color: MUTED }}>Showing the first {LIMIT} of {rows.length} centres — use the search to narrow down.</Typography>}
            {!rows.length && <Typography sx={{ p: 2, fontSize: '0.85rem', color: MUTED }}>No centre matches.</Typography>}
          </Box>
        )}
        {menu && (
          <Box onClick={() => setMenu(null)} sx={{ position: 'fixed', inset: 0, zIndex: 1500 }}>
            <Box onClick={(e) => e.stopPropagation()} sx={{ position: 'fixed', left: menu.x, top: menu.y, bgcolor: '#fff', boxShadow: 4, borderRadius: 2, p: 1, minWidth: 200 }}>
              <Typography sx={{ fontSize: '0.75rem', fontWeight: 700, px: 1, pb: 0.5 }}>{fmtDay(menu.slot.date)} · {shiftName[menu.slot.shift_id]}</Typography>
              <MenuItem dense onClick={() => setAll(menu.slot, true)}>Set every centre to YES</MenuItem>
              <MenuItem dense onClick={() => setAll(menu.slot, false)}>Set every centre to NO</MenuItem>
            </Box>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 1.5 }}>
        {data?.cameras_not_in_schedule > 0 && <Typography sx={{ fontSize: '0.75rem', color: '#b45309', mr: 'auto' }}>{data.cameras_not_in_schedule} TC code(s) with cameras are not in the schedule and do not run.</Typography>}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

// ── thresholds editor ────────────────────────────────────────────────────────
function ThresholdsDialog({ open, examId, onClose, onChanged, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [add, setAdd] = useState({ tc_code: '', max_persons: '', exam_date: '', shift_id: '' });
  const [adding, setAdding] = useState(false);
  const [edit, setEdit] = useState({});          // row id -> draft value

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData((await examsAPI.getThresholds(examId, { search: search.trim() || undefined, limit: 300 })).data); }
    catch (e) { setError(describeError(e, 'Could not load the thresholds')); }
    finally { setLoading(false); }
  }, [examId, search]);
  useEffect(() => { if (!open) return undefined; const t = setTimeout(load, 250); return () => clearTimeout(t); }, [open, load]);

  const shiftName = useMemo(() => Object.fromEntries((data?.shifts || []).map((s) => [s.id, s.name])), [data]);
  const save = async (body, okMsg) => {
    try { await examsAPI.saveThreshold(examId, body); notify(okMsg, 'success'); await load(); onChanged?.(); return true; }
    catch (e) { notify(describeError(e, 'Could not save the threshold').message, 'error'); return false; }
  };
  const commitEdit = async (row) => {
    const v = edit[row.id];
    setEdit(({ [row.id]: _, ...rest }) => rest);
    if (v === undefined || Number(v) === row.max_persons) return;
    await save({ tc_code: row.tc_code, max_persons: Number(v), exam_date: row.exam_date || undefined, shift_id: row.shift_id || undefined }, `Threshold for ${row.tc_code} set to ${v}`);
  };
  const remove = async (row) => {
    try { await examsAPI.deleteThreshold(examId, row.id); await load(); onChanged?.(); }
    catch (e) { notify(describeError(e, 'Could not delete the threshold').message, 'error'); }
  };
  const addRow = async () => {
    setAdding(true);
    const ok = await save({
      tc_code: add.tc_code.trim(), max_persons: Number(add.max_persons),
      exam_date: add.exam_date || undefined, shift_id: add.exam_date ? Number(add.shift_id) || undefined : undefined,
    }, `Threshold for ${add.tc_code.trim()} saved`);
    if (ok) setAdd({ tc_code: '', max_persons: '', exam_date: '', shift_id: '' });
    setAdding(false);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth PaperProps={{ sx: { height: '88vh' } }}>
      <DialogTitle sx={{ fontWeight: 800, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        Server room thresholds
        <IconButton onClick={onClose} size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 0 }}>
        <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', borderBottom: '1px solid #e2e8f0' }}>
          <TextField size="small" placeholder="Search TC code, centre, region" value={search} onChange={(e) => setSearch(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }} sx={{ minWidth: 260 }} />
          <Typography sx={{ fontSize: '0.75rem', color: MUTED }}>
            An alert is raised when more than this many people are in the server room. Click a value to change it.
            {data ? ` ${data.total} row(s)${data.total >= 300 ? ' (first 300 shown)' : ''}.` : ''}
          </Typography>
        </Box>
        <Box sx={{ p: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap', bgcolor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
          <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>Add / change one:</Typography>
          <TextField size="small" label="TC code" value={add.tc_code} onChange={(e) => setAdd({ ...add, tc_code: e.target.value })} sx={{ width: 120 }} />
          <TextField size="small" label="Max persons" type="number" value={add.max_persons} onChange={(e) => setAdd({ ...add, max_persons: e.target.value })} sx={{ width: 120 }} inputProps={{ min: 1, step: 'any' }} />
          <TextField size="small" label="Only on date (optional)" type="date" value={add.exam_date} onChange={(e) => setAdd({ ...add, exam_date: e.target.value })} InputLabelProps={{ shrink: true }} sx={{ width: 190 }} />
          <TextField select size="small" label="Shift" value={add.shift_id} onChange={(e) => setAdd({ ...add, shift_id: e.target.value })} disabled={!add.exam_date} sx={{ width: 130 }}>
            {(data?.shifts || []).map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
          </TextField>
          <Button variant="contained" size="small" onClick={addRow} disabled={adding || !add.tc_code.trim() || !(Number(add.max_persons) > 0) || (!!add.exam_date && !add.shift_id)}
            startIcon={adding ? <CircularProgress size={14} /> : null} sx={{ textTransform: 'none', fontWeight: 700 }}>Save</Button>
        </Box>
        {error && <Alert severity="error" sx={{ m: 1.5 }} action={<Button size="small" onClick={load}>Retry</Button>}>{error.message}</Alert>}
        {data?.centres_without_threshold?.length > 0 && (
          <Alert severity="warning" sx={{ m: 1.5 }}>
            {data.centres_without_threshold.length} centre(s) with server-room cameras have no threshold — no server-room alerts there:{' '}
            {data.centres_without_threshold.slice(0, 30).join(', ')}{data.centres_without_threshold.length > 30 ? ' …' : ''}
          </Alert>
        )}
        {loading && !data && <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box>}
        {data && !data.has_thresholds && <Alert severity="info" sx={{ m: 1.5 }}>No thresholds uploaded for this exam. Until you upload a sheet the legacy values in the worker's constants file (if any) apply.</Alert>}
        {data?.data?.length > 0 && (
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>{['TC code', 'Centre', 'Region', 'Applies to', 'Max persons', 'Source', 'Updated', ''].map((h) => <TableCell key={h} sx={{ fontWeight: 800, fontSize: '0.75rem' }}>{h}</TableCell>)}</TableRow>
            </TableHead>
            <TableBody>
              {data.data.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{r.tc_code}</TableCell>
                  <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.centre_name || '—'}</TableCell>
                  <TableCell>{r.region || '—'}</TableCell>
                  <TableCell>{r.exam_date ? `${fmtDay(r.exam_date)} · ${shiftName[r.shift_id] || r.shift_id}` : 'Every sitting'}</TableCell>
                  <TableCell>
                    <TextField size="small" type="number" variant="standard" value={edit[r.id] ?? r.max_persons}
                      onChange={(e) => setEdit({ ...edit, [r.id]: e.target.value })} onBlur={() => commitEdit(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEdit(({ [r.id]: _, ...rest }) => rest); }}
                      sx={{ width: 90 }} inputProps={{ min: 1, step: 'any' }} />
                  </TableCell>
                  <TableCell><Chip size="small" label={r.source} sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: r.source === 'manual' ? '#fef3c7' : '#f1f5f9' }} /></TableCell>
                  <TableCell sx={{ fontSize: '0.72rem', color: MUTED }}>{r.updated_by ? `${r.updated_by} · ` : ''}{fmtWhen(r.updated_at)}</TableCell>
                  <TableCell align="right"><Tooltip title="Delete this row"><IconButton size="small" onClick={() => remove(r)}><DeleteOutline fontSize="small" sx={{ color: '#dc2626' }} /></IconButton></Tooltip></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 1.5 }}><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  );
}

// ── "N centres running" for one date + shift (Schedule Analysis page) ─────────
export function SlotRunningChip({ examId, date, shiftId, shiftName }) {
  const [info, setInfo] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!examId || !date || !shiftId) { setInfo(null); return undefined; }
    let live = true;
    setErr('');
    examsAPI.getSlotSummary(examId, date, shiftId)
      .then((r) => live && setInfo(r.data))
      .catch((e) => live && (setInfo(null), setErr(describeError(e, 'Could not load the centre schedule').message)));
    return () => { live = false; };
  }, [examId, date, shiftId]);
  if (err) return <Chip size="small" color="error" variant="outlined" label={err} />;
  if (!info || !info.restricted) return null;      // no schedule uploaded: every centre runs
  const day = fmtDay(date);
  if (!info.exam_runs) {
    return (
      <Tooltip arrow title="The exam date & shift schedule (Exams page) says this shift does not run — no cameras load.">
        <Chip size="small" icon={<EventAvailable />} label={`${shiftName || 'This shift'} on ${day}: exam not running`} sx={{ fontWeight: 700, bgcolor: '#fee2e2', color: '#991b1b' }} />
      </Tooltip>
    );
  }
  const centres = info.running_centres;
  const label = centres == null
    ? `${shiftName || 'Shift'} on ${day}: all centres · ${info.running_cameras} cameras`
    : `${shiftName || 'Shift'} on ${day}: ${centres} centre${centres === 1 ? '' : 's'} running · ${info.running_cameras} of ${info.total_cameras} cameras`;
  return (
    <Tooltip arrow title="From the centre-wise schedule (Exams page): only these centres load cameras for detection and classification in this shift.">
      <Chip size="small" icon={<EventAvailable />} label={label}
        sx={{ fontWeight: 700, bgcolor: centres === 0 ? '#fee2e2' : '#dcfce7', color: centres === 0 ? '#991b1b' : '#166534' }} />
    </Tooltip>
  );
}

// ── the three sections ───────────────────────────────────────────────────────
export default function ExamScheduleSections({ exam, linkType, notify }) {
  const examId = exam?.id;
  const isRtsp = String(linkType || exam?.link_type).toUpperCase() === 'RTSP';
  const [slots, setSlots] = useState(null);
  const [centres, setCentres] = useState(null);
  const [thr, setThr] = useState(null);
  const [loadErr, setLoadErr] = useState(null);
  const [preview, setPreview] = useState(null);        // { kind, file }
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [thrOpen, setThrOpen] = useState(false);
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    if (!examId) return;
    setLoadErr(null);
    const calls = [
      examsAPI.getSlotSchedule(examId),
      isRtsp ? examsAPI.getCentreSchedule(examId) : Promise.resolve(null),
      examsAPI.getThresholds(examId, { limit: 1 }),
    ];
    const [a, b, c] = await Promise.allSettled(calls);
    setSlots(a.status === 'fulfilled' ? a.value.data : null);
    setCentres(b.status === 'fulfilled' ? b.value?.data || null : null);
    setThr(c.status === 'fulfilled' ? c.value.data : null);
    const bad = [a, b, c].find((x) => x.status === 'rejected');
    if (bad) setLoadErr(describeError(bad.reason, 'Could not load the schedule status'));
  }, [examId, isRtsp]);
  useEffect(() => { refresh(); }, [refresh]);

  const slotPick = useSheetPicker((file) => setPreview({ kind: 'slots', file }));
  const centrePick = useSheetPicker((file) => setPreview({ kind: 'centres', file }));
  const thrPick = useSheetPicker((file) => setPreview({ kind: 'thresholds', file }));
  const uploaders = {
    slots: { title: 'Exam date & shift schedule — preview', fn: (f, d) => examsAPI.uploadSlotSchedule(examId, f, d) },
    centres: { title: 'Centre-wise schedule — preview', fn: (f, d) => examsAPI.uploadCentreSchedule(examId, f, d) },
    thresholds: { title: 'Server room thresholds — preview', fn: (f, d) => examsAPI.uploadThresholds(examId, f, d) },
  };

  const clear = async (what, label, fn) => {
    if (!window.confirm(`Clear the ${label}?\n\n${what}`)) return;
    setBusy(label);
    try { const r = await fn(); notify(r.data?.message || `${label} cleared`, 'success'); await refresh(); }
    catch (e) { notify(describeError(e, `Could not clear the ${label}`).message, 'error'); }
    finally { setBusy(''); }
  };
  const dl = (promise, name) => saveBlob(promise, name, (m) => notify(m, 'error'));

  if (!examId) {
    return (
      <>
        <Heading>EXAM SCHEDULE &amp; SERVER ROOM THRESHOLDS</Heading>
        <Alert severity="info" sx={{ mb: 1 }}>
          Save the exam first, then edit it to upload the centre schedule and the server-room thresholds — they are checked against the exam's shifts and cameras.
        </Alert>
      </>
    );
  }

  const slotLine = !slots ? '—' : slots.has_schedule
    ? `${new Set(slots.slots.map((s) => s.date)).size} dates · ${slots.slots.length} slots (${slots.slots.filter((s) => s.is_running).length} running)${slots.last_upload ? ` · ${slots.last_upload.uploaded_by || ''} ${fmtWhen(slots.last_upload.created_at)}` : ''}`
    : 'Not uploaded — every date and shift of the exam runs.';
  const centreLine = !centres ? '—' : centres.has_schedule
    ? `${centres.centres.length} centres · ${centres.slots.length} date+shift slots${centres.last_upload ? ` · ${centres.last_upload.uploaded_by || ''} ${fmtWhen(centres.last_upload.created_at)}` : ''}`
    : 'Not uploaded — every centre runs in every shift.';
  const thrLine = !thr ? '—' : thr.has_thresholds
    ? `${thr.centres} centres · ${thr.shape === 'flat' ? 'one limit per centre' : thr.shape === 'sitting' ? 'per date + shift' : 'mixed'}${thr.last_upload ? ` · ${thr.last_upload.uploaded_by || ''} ${fmtWhen(thr.last_upload.created_at)}` : ''}`
    : 'Not uploaded — the legacy constants (if any) apply.';

  return (
    <>
      {loadErr && <Alert severity="error" sx={{ mt: 2 }} action={<Button size="small" onClick={refresh}>Retry</Button>}>{loadErr.message}</Alert>}

      {/* 1. exam-level date + shift schedule */}
      <Heading right={<Button onClick={() => dl(examsAPI.slotScheduleTemplate(), 'exam_schedule_template.xlsx')} startIcon={<Download sx={{ fontSize: 16 }} />} sx={{ color: BLUE, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}>Template</Button>}>
        EXAM DATE &amp; SHIFT SCHEDULE
      </Heading>
      <Box sx={cardSx}>
        <Typography sx={{ fontSize: '0.8rem', color: MUTED, mb: 1.2 }}>Which dates and shifts the exam runs in (the "Exam Schedule" sheet: Date × Shift 1/2/3, Yes/No).</Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <PickButton onPick={slotPick.pick} />
          {slots?.has_schedule && <Button onClick={() => clear('Every date and shift runs again.', 'exam date & shift schedule', () => examsAPI.deleteSlotSchedule(examId))} disabled={!!busy} startIcon={<DeleteOutline sx={{ fontSize: 16 }} />} sx={dangerSx}>Clear</Button>}
          <Chip size="small" icon={<EventAvailable />} label={slotLine} sx={{ fontWeight: 600, bgcolor: slots?.has_schedule ? '#dcfce7' : '#f1f5f9' }} />
        </Box>
      </Box>

      {/* 2. centre-wise schedule (RTSP only) */}
      {isRtsp ? (
        <>
          <Heading right={<Button onClick={() => dl(examsAPI.centreScheduleTemplate(), 'centre_schedule_template.xlsx')} startIcon={<Download sx={{ fontSize: 16 }} />} sx={{ color: BLUE, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}>Template</Button>}>
            CENTRE-WISE SCHEDULE (RTSP)
          </Heading>
          <Box sx={cardSx}>
            <Typography sx={{ fontSize: '0.8rem', color: MUTED, mb: 1.2 }}>
              Which centres (TC code) run in which date + shift — YES / NO per cell. Centres marked NO load no cameras, so no detection, classification or alert for that shift.
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <PickButton onPick={centrePick.pick} />
              {centres?.has_schedule && (
                <>
                  <Button onClick={() => setMatrixOpen(true)} startIcon={<GridOn sx={{ fontSize: 16 }} />} sx={btnSx}>View / edit</Button>
                  <Button onClick={() => dl(examsAPI.exportCentreSchedule(examId), `centre_schedule_exam_${examId}.xlsx`)} startIcon={<Download sx={{ fontSize: 16 }} />} sx={btnSx}>Export</Button>
                  <Button onClick={() => clear('Every centre runs in every shift again.', 'centre schedule', () => examsAPI.deleteCentreSchedule(examId))} disabled={!!busy} startIcon={<DeleteOutline sx={{ fontSize: 16 }} />} sx={dangerSx}>Clear</Button>
                </>
              )}
              <Chip size="small" label={centreLine} sx={{ fontWeight: 600, bgcolor: centres?.has_schedule ? '#dcfce7' : '#f1f5f9' }} />
            </Box>
            {centres?.has_schedule && centres.cameras_not_in_schedule > 0 && (
              <Alert severity="warning" sx={{ mt: 1.5 }}>{centres.cameras_not_in_schedule} TC code(s) with cameras are not in this schedule and will not run in any shift.</Alert>
            )}
          </Box>
        </>
      ) : (
        <Alert severity="info" sx={{ mt: 2 }}>The centre-wise schedule applies to RTSP exams only (HLS cameras already carry their own date and shift).</Alert>
      )}

      {/* 3. server room thresholds */}
      <Heading right={<Button onClick={() => dl(examsAPI.thresholdTemplate(), 'server_room_threshold_template.xlsx')} startIcon={<Download sx={{ fontSize: 16 }} />} sx={{ color: BLUE, fontWeight: 700, fontSize: '0.75rem', textTransform: 'none' }}>Template</Button>}>
        SERVER ROOM THRESHOLDS
      </Heading>
      <Box sx={cardSx}>
        <Typography sx={{ fontSize: '0.8rem', color: MUTED, mb: 1.2 }}>
          Maximum people allowed in the server room per centre (TC code); more than that raises a server-room detection. Replaces editing the constants file.
        </Typography>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
          <PickButton onPick={thrPick.pick} />
          {thr?.has_thresholds && (
            <>
              <Button onClick={() => setThrOpen(true)} startIcon={<TuneOutlined sx={{ fontSize: 16 }} />} sx={btnSx}>View / edit</Button>
              <Button onClick={() => dl(examsAPI.exportThresholds(examId), `server_room_thresholds_exam_${examId}.xlsx`)} startIcon={<Download sx={{ fontSize: 16 }} />} sx={btnSx}>Export</Button>
              <Button onClick={() => clear('Until a new sheet is uploaded the legacy constants (if any) apply to this exam.', 'server room thresholds', () => examsAPI.clearThresholds(examId))} disabled={!!busy} startIcon={<DeleteOutline sx={{ fontSize: 16 }} />} sx={dangerSx}>Clear</Button>
            </>
          )}
          <Chip size="small" label={thrLine} sx={{ fontWeight: 600, bgcolor: thr?.has_thresholds ? '#dcfce7' : '#f1f5f9' }} />
        </Box>
        {thr?.has_thresholds && thr.centres_without_threshold?.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1.5 }}>{thr.centres_without_threshold.length} centre(s) with server-room cameras have no threshold — no server-room alerts there.</Alert>
        )}
      </Box>

      {preview && (
        <UploadPreviewDialog open title={uploaders[preview.kind].title} file={preview.file} upload={uploaders[preview.kind].fn}
          onClose={() => { setPreview(null); slotPick.clear(); centrePick.clear(); thrPick.clear(); }}
          onSaved={(r) => { notify(r?.message || 'Saved', 'success'); refresh(); }} />
      )}
      <CentreScheduleDialog open={matrixOpen} examId={examId} onClose={() => setMatrixOpen(false)} onChanged={refresh} notify={notify} />
      <ThresholdsDialog open={thrOpen} examId={examId} onClose={() => setThrOpen(false)} onChanged={refresh} notify={notify} />
    </>
  );
}

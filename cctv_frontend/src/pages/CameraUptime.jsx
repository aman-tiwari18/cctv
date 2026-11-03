import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Dialog, DialogContent, DialogTitle, IconButton,
  InputAdornment, LinearProgress, MenuItem, Paper, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TablePagination, TableRow, TableSortLabel, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { Close, Download, PhotoCamera, Refresh, Search } from '@mui/icons-material';

// Same filter look as the Cameras page: 40px grey fields, light border, rounded.
const FIELD_SX = {
  '& .MuiInputBase-root': {
    borderRadius: '8px', bgcolor: '#f1f5f9', height: 40, fontSize: 14,
    '& fieldset': { border: '1px solid #e2e8f0' },
    '&:hover fieldset': { borderColor: '#cbd5e1' },
  },
  '& .MuiInputLabel-root': { fontSize: '0.85rem' },
};
const HEAD_CELL_SX = { fontWeight: 700, fontSize: '0.78rem', color: '#64748b', whiteSpace: 'nowrap' };
const OUTLINED_BTN_SX = {
  textTransform: 'none', borderRadius: 2, height: 40, color: '#334155', borderColor: '#e2e8f0', bgcolor: '#f1f5f9',
  '&:hover': { borderColor: '#cbd5e1', bgcolor: '#e2e8f0' },
};
import { cameraUptimeAPI, examsAPI } from '../services/api';

// Camera uptime from the independent camera-uptime-service: during each live shift it captures one
// frame per camera (one camera at a time per Camview server) and records whether it was available.

const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const hhmm = (v) => (v ? String(v).slice(11, 16) : '—');
const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)}%`);
const uptimeColor = (v) => {
  if (v === null || v === undefined) return 'text.secondary';
  if (v >= 90) return 'success.main';
  if (v >= 50) return 'warning.main';
  return 'error.main';
};

const duration = (s) => {
  const m = Math.round((Number(s) || 0) / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
};
const sinceNow = (v) => (v ? (Date.now() - new Date(String(v).replace(' ', 'T')).getTime()) / 1000 : 0);

const RESULT_CHIP = {
  UP: { label: 'Up', color: 'success' },
  DOWN: { label: 'Down', color: 'error' },
  UNKNOWN: { label: 'Unknown', color: 'warning' },
  NOT_CHECKED: { label: 'Not checked', color: 'default' },
};
const RUN_STATUS_COLOR = { RUNNING: 'info', COMPLETED: 'success', STOPPED: 'default', INTERRUPTED: 'warning' };

const STATUS_FILTERS = [
  ['', 'All cameras'],
  ['up', 'Up (last check)'],
  ['down', 'Down (last check)'],
  ['went_down', 'Went down this shift'],
  ['down_now', 'Down right now'],
  ['never_up', 'Never up this shift'],
  ['not_checked', 'Not checked yet'],
  ['unknown', 'Unknown (infrastructure)'],
  ['blank', 'Blank / no-video frame'],
];

// Column headers: [label, sort field or null].
const CENTRE_COLUMNS = [
  ['TC code', 'tc_code'], ['Centre', 'centre_name'], ['Cameras', 'cameras'], ['Checked', 'checked'],
  ['Up once', 'up_once'], ['Never up', 'never_up'], ['Not checked', 'not_checked'], ['Uptime', 'uptime_pct'],
];
const CAMERA_COLUMNS = [
  ['Camera', 'camera_name'], ['Centre', 'tc_code'], ['Server', 'server'],
  ['Checks (up / down / unknown)', 'checks_total'], ['Uptime', 'uptime_pct'], ['Downtime', 'downtime_s'],
  ['Last up', 'last_up_at'], ['Last check', 'last_checked_at'], ['Frame', null],
];

// Missing values sort last in either direction; numbers compare as numbers.
const compareBy = (field, dir) => (a, b) => {
  const x = a[field];
  const y = b[field];
  if (x === null || x === undefined || x === '') return y === null || y === undefined || y === '' ? 0 : 1;
  if (y === null || y === undefined || y === '') return -1;
  const n = typeof x === 'number' && typeof y === 'number'
    ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
  return dir === 'desc' ? -n : n;
};

function SortHeader({ columns, sort, onSort }) {
  return (
    <TableRow>
      {columns.map(([label, field]) => (
        <TableCell key={label} sx={HEAD_CELL_SX} sortDirection={sort.field === field ? sort.dir : false}>
          {field ? (
            <TableSortLabel active={sort.field === field} direction={sort.field === field ? sort.dir : 'asc'}
              onClick={() => onSort(field)}>
              {label}
            </TableSortLabel>
          ) : label}
        </TableCell>
      ))}
    </TableRow>
  );
}

// Click a header: ascending, again: descending, a third time: back to the default order.
const nextSort = (sort, field) => {
  if (sort.field !== field) return { field, dir: 'asc' };
  return sort.dir === 'asc' ? { field, dir: 'desc' } : { field: null, dir: 'asc' };
};

const isOngoing = (exam) => {
  const t = todayISO();
  const s = exam.start_date ? String(exam.start_date).slice(0, 10) : null;
  const e = exam.end_date ? String(exam.end_date).slice(0, 10) : s;
  return exam.is_active && s && s <= t && (!e || t <= e);
};

function Kpi({ label, value, hint, color }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, minWidth: 150, flex: '1 1 150px' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>{label}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color: color || 'text.primary' }}>{value}</Typography>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}
    </Paper>
  );
}

export default function CameraUptime() {
  const [exams, setExams] = useState([]);
  const [examId, setExamId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dates, setDates] = useState([]);
  const [runs, setRuns] = useState([]);
  const [runId, setRunId] = useState(null);
  const [centres, setCentres] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [statusFilter, setStatusFilter] = useState('');
  const [tcFilter, setTcFilter] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [live, setLive] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [frame, setFrame] = useState(null); // { camera, url, loading, error }
  const [periodsCam, setPeriodsCam] = useState(null); // camera whose down periods are shown
  const [centreSort, setCentreSort] = useState({ field: null, dir: 'asc' });
  const [cameraSort, setCameraSort] = useState({ field: null, dir: 'asc' });
  const frameUrlRef = useRef(null);

  // Exams list; preselect an ongoing exam.
  useEffect(() => {
    (async () => {
      try {
        const res = await examsAPI.getAll();
        const list = Array.isArray(res?.data?.data) ? res.data.data : [];
        setExams(list);
        const pick = list.find(isOngoing) || list[0];
        if (pick) setExamId(pick.id);
      } catch (e) {
        setError('Failed to load exams');
      }
    })();
  }, []);

  // Dates that have uptime data; jump to the latest one when today has none.
  useEffect(() => {
    if (!examId) return;
    cameraUptimeAPI.getDates(examId)
      .then((res) => {
        const list = res?.data?.data || [];
        setDates(list);
        setDate((d) => (list.length && !list.includes(d) ? list[0] : d));
      })
      .catch(() => setDates([]));
  }, [examId]);

  const loadRuns = useCallback(async () => {
    if (!examId || !date) return;
    try {
      const res = await cameraUptimeAPI.getRuns(examId, date);
      const list = res?.data?.data || [];
      setRuns(list);
      setRunId((cur) => {
        if (list.some((r) => r.id === cur)) return cur;
        const running = list.find((r) => r.status === 'RUNNING');
        return (running || list[list.length - 1] || {}).id ?? null;
      });
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load uptime runs');
    }
  }, [examId, date]);

  const loadDetails = useCallback(async () => {
    if (!runId) {
      setCentres([]);
      setCameras([]);
      setTotal(0);
      return;
    }
    try {
      const [c, cams] = await Promise.all([
        cameraUptimeAPI.getCentres(runId),
        cameraUptimeAPI.getCameras({
          run_id: runId, page: page + 1, limit: rowsPerPage,
          ...(statusFilter ? { status: statusFilter } : {}),
          ...(tcFilter ? { tc_code: tcFilter } : {}),
          ...(query ? { q: query } : {}),
          ...(cameraSort.field ? { sort: cameraSort.field, order: cameraSort.dir } : {}),
        }),
      ]);
      setCentres(c?.data?.data || []);
      setCameras(cams?.data?.data || []);
      setTotal(cams?.data?.pagination?.total || 0);
    } catch (e) {
      setError(e?.response?.data?.message || 'Failed to load cameras');
    }
  }, [runId, page, rowsPerPage, statusFilter, tcFilter, query, cameraSort]);

  const loadLive = useCallback(async () => {
    try {
      const res = await cameraUptimeAPI.getLive();
      setLive(res?.data?.data || null);
    } catch (_) {
      setLive(null);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    loadRuns().finally(() => setLoading(false));
  }, [loadRuns]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  // Search as you type (like the Cameras page), once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { loadLive(); }, [loadLive]);

  const run = useMemo(() => runs.find((r) => r.id === runId) || null, [runs, runId]);

  // Refresh every 30 s while the selected shift is being checked.
  useEffect(() => {
    if (run?.status !== 'RUNNING') return undefined;
    const t = setInterval(() => { loadRuns(); loadDetails(); loadLive(); }, 30000);
    return () => clearInterval(t);
  }, [run?.status, loadRuns, loadDetails, loadLive]);

  useEffect(() => { setPage(0); }, [runId, statusFilter, tcFilter, query, cameraSort]);

  useEffect(() => () => { if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current); }, []);

  const liveRun = useMemo(
    () => (live?.available ? (live.runs || []).find((r) => r.run_id === runId) : null),
    [live, runId],
  );

  const handleDownload = async (onlyShift) => {
    setDownloading(true);
    setError('');
    try {
      const res = await cameraUptimeAPI.download({
        exam_id: examId, date, ...(onlyShift && run ? { shift_id: run.shift_id } : {}),
      });
      const disposition = res.headers?.['content-disposition'] || '';
      const match = /filename="?([^";]+)"?/.exec(disposition);
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = match ? match[1] : `camera_uptime_exam${examId}_${date}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError('No uptime data to download for this exam and date');
    } finally {
      setDownloading(false);
    }
  };

  const openFrame = async (cam) => {
    if (frameUrlRef.current) URL.revokeObjectURL(frameUrlRef.current);
    frameUrlRef.current = null;
    setFrame({ camera: cam, url: null, loading: true, error: '' });
    try {
      const res = await cameraUptimeAPI.getFrame(cam.last_frame_path);
      const url = URL.createObjectURL(res.data);
      frameUrlRef.current = url;
      setFrame({ camera: cam, url, loading: false, error: '' });
    } catch (e) {
      setFrame({ camera: cam, url: null, loading: false, error: 'Frame not available' });
    }
  };

  const sortedCentres = useMemo(
    () => (centreSort.field ? [...centres].sort(compareBy(centreSort.field, centreSort.dir)) : centres),
    [centres, centreSort],
  );

  const lanes = live?.available ? (live.scheduler?.lanes || []) : [];
  const paused = live?.available ? Object.values(live.scheduler?.paused || {}) : [];

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 0.5 }}>Camera Uptime</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        During each live shift every scheduled camera is checked one at a time per Camview server: a captured
        frame means available. Uptime % = up checks ÷ (up + down checks); infrastructure failures count as
        unknown and are left out.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>{error}</Alert>}

      <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
        <TextField select size="small" label="Exam" value={examId} onChange={(e) => setExamId(e.target.value)}
          sx={{ ...FIELD_SX, flex: { xs: '1 1 100%', sm: '0 1 380px' }, minWidth: 0 }}>
          {exams.map((e) => <MenuItem key={e.id} value={e.id}>{e.exam_name} ({e.link_type})</MenuItem>)}
        </TextField>
        <Tooltip arrow title={dates.length ? `Uptime data on ${dates.length} date(s): ${dates.slice(0, 6).join(', ')}${dates.length > 6 ? ' …' : ''}` : 'No uptime data for this exam yet'}>
          <TextField size="small" type="date" label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            InputLabelProps={{ shrink: true }} sx={{ ...FIELD_SX, flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 170px' } }} />
        </Tooltip>
        <Tooltip title="Refresh">
          <IconButton onClick={() => { loadRuns(); loadDetails(); loadLive(); }}
            sx={{ width: 40, height: 40, borderRadius: 2, color: '#334155', border: '1px solid #e2e8f0', bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
            <Refresh sx={{ fontSize: 20 }} />
          </IconButton>
        </Tooltip>
        <Box sx={{ flex: 1 }} />
        <Button variant="outlined" disabled={!run || downloading} onClick={() => handleDownload(true)}
          startIcon={<Download />} sx={OUTLINED_BTN_SX}>
          Excel: this shift
        </Button>
        <Button variant="contained" disableElevation disabled={!runs.length || downloading}
          onClick={() => handleDownload(false)}
          startIcon={downloading ? <CircularProgress size={14} color="inherit" /> : <Download />}
          sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2, height: 40 }}>
          Excel: all shifts
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 2 }} />}

      {!loading && !runs.length && (
        <Alert severity="info" sx={{ mb: 2 }}>
          No uptime data for this exam on {date}. Checks run only inside each scheduled shift window.
        </Alert>
      )}

      {runs.length > 0 && (
        <Tabs value={runId || false} onChange={(_, v) => setRunId(v)} variant="scrollable" sx={{ mb: 2 }}>
          {runs.map((r) => (
            <Tab key={r.id} value={r.id} sx={{ textTransform: 'none' }} label={(
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>{r.shift_label} · {r.shift_start}-{r.shift_end}</span>
                <Chip size="small" label={r.status} color={RUN_STATUS_COLOR[r.status] || 'default'} />
              </Box>
            )} />
          ))}
        </Tabs>
      )}

      {run && (
        <>
          {run.status === 'RUNNING' && (
            <Alert severity={paused.length ? 'warning' : 'info'} sx={{ mb: 2 }}>
              {live?.available ? (
                <>
                  Checking now (window {hhmm(run.window_start)}–{hhmm(run.window_end)}){liveRun ? '' : ' — waiting for the service'}.
                  {paused.length > 0 && ` Paused: ${paused.join('; ')}.`}
                  <Box component="span" sx={{ display: 'block', mt: 0.5 }}>
                    {lanes.map((l) => (
                      <Chip key={l.lane} size="small" variant="outlined" sx={{ mr: 0.75, mb: 0.5 }}
                        color={l.pause_reason ? 'warning' : 'default'}
                        label={`${l.lane}: pass ${l.pass}, ${l.pending} left${l.eta_pass_s ? `, ~${Math.round(l.eta_pass_s / 60)} min` : ''}${l.pause_reason ? ` (paused: ${l.pause_reason})` : ''}`} />
                    ))}
                  </Box>
                </>
              ) : 'The uptime service is not reachable right now; showing the data recorded so far.'}
            </Alert>
          )}

          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
            <Kpi label="Scheduled cameras" value={run.cameras} hint={`window ${hhmm(run.window_start)}–${hhmm(run.window_end)}`} />
            <Kpi label="Checked" value={run.checked} hint={`coverage ${pct(run.coverage_pct)} · ${run.full_passes} full pass(es)`} />
            <Kpi label="Up at least once" value={run.up_once} color="success.main" />
            <Kpi label="Never up" value={run.never_up} color={run.never_up ? 'error.main' : undefined}
              hint={`${run.not_checked} not checked yet`} />
            <Kpi label="Avg uptime" value={pct(run.avg_uptime_pct)} color={uptimeColor(run.avg_uptime_pct)}
              hint={`${run.up_checks} up · ${run.down_checks} down · ${run.unknown_checks} unknown checks`} />
          </Box>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>Centres</Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2, mb: 3, maxHeight: 320 }}>
            <Table size="small" stickyHeader>
              <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: '#f8fafc' } }}>
                <SortHeader columns={CENTRE_COLUMNS} sort={centreSort} onSort={(f) => setCentreSort((s) => nextSort(s, f))} />
              </TableHead>
              <TableBody>
                {sortedCentres.map((c) => (
                  <TableRow key={c.tc_code || 'none'} hover selected={tcFilter === c.tc_code} sx={{ cursor: 'pointer' }}
                    onClick={() => setTcFilter(tcFilter === c.tc_code ? '' : (c.tc_code || ''))}>
                    <TableCell>{c.tc_code || '—'}</TableCell>
                    <TableCell>{c.centre_name || '—'}</TableCell>
                    <TableCell>{c.cameras}</TableCell>
                    <TableCell>{c.checked}</TableCell>
                    <TableCell>{c.up_once}</TableCell>
                    <TableCell sx={{ color: Number(c.never_up) ? 'error.main' : undefined }}>{c.never_up}</TableCell>
                    <TableCell>{c.not_checked}</TableCell>
                    <TableCell sx={{ fontWeight: 700, color: uptimeColor(c.uptime_pct) }}>{pct(c.uptime_pct)}</TableCell>
                  </TableRow>
                ))}
                {!centres.length && <TableRow><TableCell colSpan={8} align="center">No centres</TableCell></TableRow>}
              </TableBody>
            </Table>
          </TableContainer>

          <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
            Cameras <Typography component="span" variant="body2" color="text.secondary">({total})</Typography>
          </Typography>
          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center', mb: 1.5 }}>
            <TextField size="small" placeholder="Search camera, centre, TC code or key..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              InputProps={{
                startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>,
                endAdornment: (search.trim() !== query ? (
                  <InputAdornment position="end"><CircularProgress size={16} sx={{ color: '#94a3b8' }} /></InputAdornment>
                ) : search && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearch('')}><Close sx={{ fontSize: 16 }} /></IconButton>
                  </InputAdornment>
                )),
              }}
              sx={{ ...FIELD_SX, '& .MuiInputBase-root': { ...FIELD_SX['& .MuiInputBase-root'], bgcolor: '#f8fafc' },
                flex: { xs: '1 1 100%', sm: '1 1 260px' }, maxWidth: { sm: 420 } }} />
            <TextField select size="small" label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
              sx={{ ...FIELD_SX, flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 220px' } }}>
              {STATUS_FILTERS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
            </TextField>
            <Autocomplete size="small" options={centres} value={centres.find((c) => (c.tc_code || '') === tcFilter) || null}
              onChange={(_, c) => setTcFilter(c ? (c.tc_code || '') : '')}
              isOptionEqualToValue={(o, v) => o.tc_code === v.tc_code}
              getOptionLabel={(c) => `${c.tc_code || '—'}${c.centre_name ? ` · ${c.centre_name}` : ''}`}
              renderOption={(props, c) => (
                <li {...props} key={c.tc_code || 'none'} style={{ fontSize: '0.82rem' }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>{c.tc_code || '—'}{c.centre_name ? ` · ${c.centre_name}` : ''}</Box>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{c.cameras}</Typography>
                </li>
              )}
              renderInput={(params) => <TextField {...params} label="TC code / centre" sx={FIELD_SX} />}
              sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 1 300px' }, minWidth: 0 }} />
            {(statusFilter || tcFilter || search) && (
              <Button size="small" color="inherit" onClick={() => { setStatusFilter(''); setTcFilter(''); setSearch(''); setQuery(''); }}
                sx={{ height: 40, borderRadius: 2, textTransform: 'none', fontSize: '0.85rem', color: '#64748b', px: 1 }}>
                Clear
              </Button>
            )}
            {(statusFilter || tcFilter || query) && (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, width: '100%' }}>
                {statusFilter && (
                  <Chip size="small" variant="outlined" onDelete={() => setStatusFilter('')}
                    label={`Status: ${(STATUS_FILTERS.find(([v]) => v === statusFilter) || [])[1] || statusFilter}`} />
                )}
                {tcFilter && (
                  <Chip size="small" variant="outlined" onDelete={() => setTcFilter('')}
                    label={`TC: ${tcFilter}${(centres.find((c) => c.tc_code === tcFilter) || {}).centre_name ? ` · ${centres.find((c) => c.tc_code === tcFilter).centre_name}` : ''}`} />
                )}
                {query && <Chip size="small" variant="outlined" label={`Search: ${query}`} onDelete={() => setSearch('')} />}
              </Box>
            )}
          </Box>
          <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ '& .MuiTableCell-root': { bgcolor: '#f8fafc' } }}>
                <SortHeader columns={CAMERA_COLUMNS} sort={cameraSort} onSort={(f) => setCameraSort((s) => nextSort(s, f))} />
              </TableHead>
              <TableBody>
                {cameras.map((c) => {
                  const chip = RESULT_CHIP[c.last_result] || RESULT_CHIP.NOT_CHECKED;
                  return (
                    <TableRow key={c.id} hover>
                      <TableCell sx={{ fontWeight: 600 }}>
                        {c.camera_name || c.camera_key}
                        {Number(c.checks_blank) > 0 && (
                          <Tooltip title="At least one captured frame was blank (uniform / no-video screen)">
                            <Chip size="small" label="blank frame" color="warning" variant="outlined" sx={{ ml: 1 }} />
                          </Tooltip>
                        )}
                      </TableCell>
                      <TableCell>{c.tc_code}{c.centre_name ? ` · ${c.centre_name}` : ''}</TableCell>
                      <TableCell>{c.server}</TableCell>
                      <TableCell>{c.checks_total} ({c.checks_up} / {c.checks_down} / {c.checks_unknown})</TableCell>
                      <TableCell sx={{ fontWeight: 700, color: uptimeColor(c.uptime_pct) }}>{pct(c.uptime_pct)}</TableCell>
                      <TableCell>
                        {Number(c.outages) > 0 ? (
                          <Box component="span" onClick={() => setPeriodsCam(c)} title="Show when it was down and why"
                            sx={{ cursor: 'pointer', color: 'error.main', fontWeight: 600, textDecoration: 'underline dotted' }}>
                            {duration(Number(c.downtime_s) + (c.down_since && run?.status === 'RUNNING' ? sinceNow(c.down_since) : 0))}
                            {' · '}{c.outages} time{Number(c.outages) > 1 ? 's' : ''}
                          </Box>
                        ) : (Number(c.checks_total) > 0 ? 'none' : '—')}
                        {c.down_since && (
                          <Typography variant="caption" color="error.main" sx={{ display: 'block' }}>
                            down since {hhmm(c.down_since)}: {c.down_reason_label}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>{hhmm(c.last_up_at)}</TableCell>
                      <TableCell>
                        <Chip size="small" label={`${chip.label}${c.last_checked_at ? ` ${hhmm(c.last_checked_at)}` : ''}`} color={chip.color} />
                        {c.last_result !== 'UP' && c.last_reason_label && c.last_result !== 'NOT_CHECKED' && (
                          <Typography variant="caption" color={c.last_result === 'DOWN' ? 'error.main' : 'warning.main'}
                            sx={{ display: 'block', mt: 0.25 }}>
                            {c.last_reason_label}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {c.last_frame_path ? (
                          <IconButton size="small" onClick={() => openFrame(c)} title={`Latest frame (${hhmm(c.last_frame_at)})`}>
                            <PhotoCamera fontSize="small" />
                          </IconButton>
                        ) : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!cameras.length && <TableRow><TableCell colSpan={9} align="center" sx={{ py: 3 }}>No cameras</TableCell></TableRow>}
              </TableBody>
            </Table>
            <TablePagination component="div" count={total} page={page} rowsPerPage={rowsPerPage}
              rowsPerPageOptions={[25, 50, 100, 200]} onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }} />
          </TableContainer>
        </>
      )}

      <Dialog open={!!periodsCam} onClose={() => setPeriodsCam(null)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          {periodsCam?.camera_name || periodsCam?.camera_key}
          <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">
            {periodsCam?.tc_code} · down {periodsCam?.outages} time(s) this shift. A down period starts at the check
            that found it down and ends at the next check that found it up.
          </Typography>
          <IconButton onClick={() => setPeriodsCam(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Table size="small">
            <TableHead>
              <TableRow>
                {['Down at', 'Up again at', 'Down for', 'Reason'].map((h) => (
                  <TableCell key={h} sx={{ fontWeight: 700 }}>{h}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {(periodsCam?.downtime_periods || []).map((p) => (
                <TableRow key={p.down_at}>
                  <TableCell>{hhmm(p.down_at)}</TableCell>
                  <TableCell>{p.up_at ? hhmm(p.up_at) : `still down at ${hhmm(p.until)}`}</TableCell>
                  <TableCell>{duration(p.down_s)}</TableCell>
                  <TableCell>{p.reason_label}</TableCell>
                </TableRow>
              ))}
              {periodsCam?.down_since && (
                <TableRow>
                  <TableCell>{hhmm(periodsCam.down_since)}</TableCell>
                  <TableCell sx={{ color: 'error.main', fontWeight: 600 }}>still down</TableCell>
                  <TableCell>{run?.status === 'RUNNING' ? `${duration(sinceNow(periodsCam.down_since))} so far` : '—'}</TableCell>
                  <TableCell>{periodsCam.down_reason_label}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>

      <Dialog open={!!frame} onClose={() => setFrame(null)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pr: 6 }}>
          {frame?.camera?.camera_name || frame?.camera?.camera_key}
          <Typography variant="caption" sx={{ display: 'block' }} color="text.secondary">
            {frame?.camera?.tc_code} · latest frame {frame?.camera?.last_frame_at || ''}
          </Typography>
          <IconButton onClick={() => setFrame(null)} sx={{ position: 'absolute', right: 8, top: 8 }}><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          {frame?.loading && <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>}
          {frame?.error && <Alert severity="warning">{frame.error}</Alert>}
          {frame?.url && <Box component="img" src={frame.url} alt="latest frame" sx={{ width: '100%', borderRadius: 1 }} />}
        </DialogContent>
      </Dialog>
    </Box>
  );
}

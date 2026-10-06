import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Chip,
  FormControl,
  Select,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  InputAdornment,
  Tooltip,
  Alert,
  IconButton,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Search,
  Download,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  ImageNotSupported as ImageNotSupportedIcon,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { examsAPI, camerasAPI, clientDashboardAPI, executionsAPI } from '../services/api';
import ExamSidebar from '../components/ExamSidebar';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { format } from 'date-fns';
import { IMG_BASE } from '../constants/data';
import * as XLSX from 'xlsx';

// Build the script-server frame URL from a stored absolute frame_path
// (mirrors the admin Cameras page helper).
const buildFrameImageUrl = (framePath) => {
  if (!framePath) return '';
  const marker = 'classification_frames/';
  const idx = framePath.indexOf(marker);
  if (idx === -1) return '';
  const relative = framePath.slice(idx);
  return `${IMG_BASE}/serve-rtsp-detection-images/${relative}`;
};

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const truncate = (str, n = 40) => str && str.length > n ? str.slice(0, n) + '…' : str;

const COLUMN_LABELS = {
  tc_code: 'Center Code',
};

const formatColumnLabel = (col) =>
  COLUMN_LABELS[col] || col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

const getStatusChipProps = (status) => {
  const normalized = String(status || '').trim().toLowerCase();

  if (normalized === 'accessible' || normalized === 'online') {
    return {
      label: 'Accessible',
      sx: {
        bgcolor: '#eaf3ff',
        color: '#2563eb',
        border: '1px solid #bfdbfe',
      },
    };
  }

  if (normalized === 'not accessible' || normalized === 'inaccessible' || normalized === 'offline') {
    return {
      label: 'Not Accessible',
      sx: {
        bgcolor: '#f8fafc',
        color: '#64748b',
        border: '1px solid #cbd5e1',
      },
    };
  }

  return {
    label: status || 'Unknown',
    sx: {
      bgcolor: '#f9fafb',
      color: '#6b7280',
      border: '1px solid #e5e7eb',
    },
  };
};

const parseDDMMYYYYToISO = (value) => {
  if (!value) return '';
  const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
  if (!match) return value;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

const ClientCameras = () => {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchParams] = useSearchParams();
  const [camSidebarOpen, setCamSidebarOpen] = useState(true);
  const [camViewingArchived, setCamViewingArchived] = useState(false);
  // Collapse the exam rail by default on phones so the content keeps full width.
  useEffect(() => { setCamSidebarOpen(!isSmDown); }, [isSmDown]);
  const [camExams, setCamExams] = useState([]);
  const [selectedCamExamId, setSelectedCamExamId] = useState(searchParams.get('exam') || '');
  const [cameras, setCameras] = useState([]);
  const [camLoading, setCamLoading] = useState(false);
  const [camExamLinkType, setCamExamLinkType] = useState(null);
  const [camStatusCounts, setCamStatusCounts] = useState({ accessible: 0, notAccessible: 0, unknown: 0 });
  const [camSearchQuery, setCamSearchQuery] = useState('');
  const [camDebouncedSearch, setCamDebouncedSearch] = useState('');
  const [camOrderBy, setCamOrderBy] = useState('');
  const [camOrder, setCamOrder] = useState('asc');
  const [camPage, setCamPage] = useState(0);
  // Default to 15 rows on mobile (<sm), 50 on larger screens. Read the real
  // viewport width once at mount (reliable, unlike useMediaQuery's first value).
  const [camRowsPerPage, setCamRowsPerPage] = useState(() => (window.innerWidth < theme.breakpoints.values.sm ? 15 : 50));
  const [camTotal, setCamTotal] = useState(0);
  const [camFilterShiftId, setCamFilterShiftId] = useState('');
  const [camFilterExamDate, setCamFilterExamDate] = useState('');
  // RTSP: what the exam schedule did to the list for the chosen date + shift (null = nothing chosen)
  const [camScheduleInfo, setCamScheduleInfo] = useState(null);
  // exam whose default date was already applied (so clearing the date by hand is respected)
  const defaultDateFor = useRef(null);
  const [camFilterRegion, setCamFilterRegion] = useState('');
  const [camRegionOptions, setCamRegionOptions] = useState([]);
  const [camVisionSummary, setCamVisionSummary] = useState(null);
  // Frame-preview dialog (read-only; mirrors the admin Cameras page)
  const [previewCamera, setPreviewCamera] = useState(null);
  const [previewError, setPreviewError] = useState(false);

  // Update the default page size only when the viewport crosses the sm
  // boundary (mobile <-> desktop), so it stays responsive to resizing while a
  // manual page-size choice still sticks as long as you don't cross over.
  useEffect(() => {
    const sm = theme.breakpoints.values.sm;
    let wasMobile = window.innerWidth < sm;
    const onResize = () => {
      const isMobile = window.innerWidth < sm;
      if (isMobile !== wasMobile) {
        wasMobile = isMobile;
        setCamRowsPerPage(isMobile ? 15 : 50);
        setCamPage(0);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [theme]);

  const loadCamExams = useCallback(async () => {
    try {
      const res = await examsAPI.getAll({ is_active: true });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setCamExams(list);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    loadCamExams();
  }, [loadCamExams]);

  useEffect(() => {
    const timer = setTimeout(() => setCamDebouncedSearch(camSearchQuery), 500);
    return () => clearTimeout(timer);
  }, [camSearchQuery]);

  const loadCameras = useCallback(async () => {
    if (!selectedCamExamId) return;
    setCamLoading(true);
    try {
      const params = { is_active: true, page: camPage + 1, limit: camRowsPerPage };
      if (camFilterShiftId) params.shift_id = camFilterShiftId;
      if (camFilterExamDate) params.exam_date = parseDDMMYYYYToISO(camFilterExamDate);
      if (camFilterRegion) params.region = camFilterRegion;
      if (camDebouncedSearch.trim()) params.search = camDebouncedSearch.trim();
      const res = await camerasAPI.getByExam(selectedCamExamId, params);
      setCameras(res.data.data || []);
      setCamTotal(res.data.totalCount || (res.data.data || []).length);
      setCamExamLinkType(res.data.linkType);
      setCamStatusCounts(res.data.statusCounts || { accessible: 0, notAccessible: 0, unknown: 0 });
      setCamScheduleInfo(res.data.schedule || null);
    } catch (e) { console.error(e); }
    finally { setCamLoading(false); }
  }, [selectedCamExamId, camPage, camRowsPerPage, camFilterShiftId, camFilterExamDate, camFilterRegion, camDebouncedSearch]);

  const loadCamRegionOptions = useCallback(async () => {
    if (!selectedCamExamId) { setCamRegionOptions([]); return; }
    try {
      const res = await camerasAPI.getRegions(selectedCamExamId);
      setCamRegionOptions(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch {
      setCamRegionOptions([]);
    }
  }, [selectedCamExamId]);

  const loadVisionSummary = useCallback(() => {
    if (!selectedCamExamId) return;
    executionsAPI.getVisionSummary({ exam_id: selectedCamExamId })
      .then((res) => setCamVisionSummary(res?.data?.data || null))
      .catch(() => setCamVisionSummary(null));
  }, [selectedCamExamId]);

  useEffect(() => {
    if (selectedCamExamId) { loadCameras(); loadVisionSummary(); }
    else { setCameras([]); setCamTotal(0); setCamVisionSummary(null); }
    setCamFilterShiftId('');
    setCamFilterExamDate('');
    setCamScheduleInfo(null);
    defaultDateFor.current = null;          // pick the default date again for this exam
    setCamFilterRegion('');
    setCamSearchQuery('');
    setCamDebouncedSearch('');
    setCamPage(0);
    loadCamRegionOptions();
  }, [selectedCamExamId]);   // eslint-disable-line react-hooks/exhaustive-deps

  /* Re-fetch vision summary every 60s while it started today and workers may still be active */
  useEffect(() => {
    if (!camVisionSummary?.started_at) return;
    const today = new Date().toISOString().slice(0, 10);
    const startedToday = camVisionSummary.started_at.startsWith(today);
    const durationShort = (camVisionSummary.duration_minutes ?? 0) < 600;
    if (!startedToday || !durationShort) return;
    const timer = setInterval(loadVisionSummary, 60_000);
    return () => clearInterval(timer);
  }, [camVisionSummary, loadVisionSummary]);

  useEffect(() => {
    if (selectedCamExamId) loadCameras();
  }, [camPage, camRowsPerPage, camFilterShiftId, camFilterExamDate, camFilterRegion, camDebouncedSearch]);

  const selectedCamExamData = camExams.find(e => String(e.id) === String(selectedCamExamId));
  const isHLS = camExamLinkType === 'HLS' || selectedCamExamData?.link_type?.toUpperCase() === 'HLS';
  const camShifts = selectedCamExamData?.examShifts || [];

  /* Date filter: limited to the exam's dates, and preselected (same rule as the admin Cameras tab).
     A running exam opens on today, a finished one on its last day, one not started yet on its first. */
  const dayOf = (v) => (v ? String(v).slice(0, 10) : '');
  const examStartIso = dayOf(selectedCamExamData?.start_date);
  const examEndIso = dayOf(selectedCamExamData?.end_date);
  useEffect(() => {
    if (!selectedCamExamData || String(defaultDateFor.current) === String(selectedCamExamData.id)) return;
    defaultDateFor.current = selectedCamExamData.id;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let iso;
    if (selectedCamExamData.is_active === false) iso = examEndIso || today;
    else if (examStartIso && today < examStartIso) iso = examStartIso;
    else if (examEndIso && today > examEndIso) iso = examEndIso;
    else iso = today;
    const [y, m, d] = iso.split('-');
    if (y && m && d) { setCamFilterExamDate(`${d}-${m}-${y}`); setCamPage(0); }
  }, [selectedCamExamData]);   // eslint-disable-line react-hooks/exhaustive-deps

  const handleCamSort = (property) => {
    const isAsc = camOrderBy === property && camOrder === 'asc';
    setCamOrder(isAsc ? 'desc' : 'asc');
    setCamOrderBy(property);
  };

  const sortedCameras = useMemo(() => {
    if (!camOrderBy) return cameras;
    return [...cameras].sort((a, b) => {
      let aVal = a[camOrderBy], bVal = b[camOrderBy];
      if (camOrderBy === 'shift_name') {
        aVal = camShifts.find(s => s.id === a.shift_id)?.shift_name || '';
        bVal = camShifts.find(s => s.id === b.shift_id)?.shift_name || '';
      }
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      if (aVal < bVal) return camOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return camOrder === 'asc' ? 1 : -1;
      return 0;
    });
  }, [cameras, camOrderBy, camOrder, camShifts]);

  const handleDownloadTemplate = async (type) => {
    if (!selectedCamExamId) return;
    try { await camerasAPI.downloadTemplate(selectedCamExamId, type); }
    catch (e) { console.error('Failed to download template', e); }
  };

  /* ── Download cameras sheet by status (same as admin Cameras page) ──
     statusKey: 'accessible' | 'notAccessible' | 'total' */
  const downloadStatusSheet = async (statusKey) => {
    if (!selectedCamExamId) return;
    try {
      const params = { is_active: true, page: 1, limit: 1000000 };
      if (camFilterShiftId) params.shift_id = camFilterShiftId;
      if (camFilterExamDate) params.exam_date = parseDDMMYYYYToISO(camFilterExamDate);
      const res = await camerasAPI.getByExam(selectedCamExamId, params);
      let rows = res.data.data || [];
      const hls = (res.data.linkType === 'HLS') || isHLS;

      if (statusKey === 'accessible') {
        rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'accessible');
      } else if (statusKey === 'notAccessible') {
        rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'not accessible');
      }
      if (rows.length === 0) return;

      const toAbsFrame = (fp) => {
        const rel = buildFrameImageUrl(fp);
        if (!rel) return '';
        return /^https?:/i.test(rel)
          ? rel
          : `http://www.examscctvmonitoring.com${rel.startsWith('/') ? '' : '/'}${rel}`;
      };

      // Not Accessible cameras have no classification / frame → drop those columns.
      const dropClassView = statusKey === 'notAccessible';

      let sheetRows, viewCol, cols;
      if (hls) {
        sheetRows = rows.map((cam) => ({
          'Centre Name': cam.centre_name || '-',
          'TC Code': cam.tc_code || '-',
          'State': cam.state || '-',
          'Camera Name': cam.camera_name || '-',
          'Ch Code': cam.ch_code || '-',
          'Camera Category': cam.camera_category || 'N/A',
          ...(dropClassView ? {} : { 'Classification': cam.classification || '-' }),
          'Status': cam.status || '-',
          'Exam Date': formatDateDDMMYYYY(cam.exam_date) || '-',
          'Shift': cam.shift_id
            ? (camShifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
            : 'All shifts',
          ...(dropClassView ? {} : { 'View': toAbsFrame(cam.frame_path) }),
        }));
        viewCol = dropClassView ? -1 : 10;
        cols = dropClassView
          ? [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }]
          : [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 60 }];
      } else {
        sheetRows = rows.map((cam) => ({
          'Device ID': cam.device_id || '-',
          'Camera No': cam.camera_no ?? '-',
          'TC Code': cam.tc_code || '-',
          'Camera Name': cam.camera_name || '-',
          'Centre Name': cam.centre_name || cam.tc_name || '-',
          'State': cam.state || '-',
          'Region': cam.region || '-',
          ...(dropClassView ? {} : { 'Classification': cam.classification || '-' }),
          'Status': cam.status || '-',
          ...(dropClassView ? {} : { 'View': toAbsFrame(cam.frame_path) }),
          'CCTV URL': cam.cctv_url || cam.url || '-',
        }));
        viewCol = dropClassView ? -1 : 9;
        cols = dropClassView
          ? [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 60 }]
          : [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 60 }];
      }

      const ws = XLSX.utils.json_to_sheet(sheetRows);
      ws['!cols'] = cols;

      if (viewCol >= 0) {
        const range = XLSX.utils.decode_range(ws['!ref']);
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
          const addr = XLSX.utils.encode_cell({ r: R, c: viewCol });
          const url = sheetRows[R - 1]['View'];
          ws[addr] = url
            ? { v: 'View', t: 's', l: { Target: url, Tooltip: 'Open frame' } }
            : { v: '-', t: 's' };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cameras');
      const label = statusKey === 'accessible' ? 'Accessible'
        : statusKey === 'notAccessible' ? 'Not_Accessible' : 'All';
      const examName = (selectedCamExamData?.exam_name || 'exam').replace(/[^\w]+/g, '_');
      XLSX.writeFile(wb, `${examName}_${label}_cameras.xlsx`);
    } catch (e) {
      console.error('Camera status download failed:', e);
    }
  };

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', bgcolor: '#f8fafc', borderRadius: 2, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <ExamSidebar
        open={camSidebarOpen}
        onToggle={() => setCamSidebarOpen(!camSidebarOpen)}
        exams={camExams}
        selectedExamId={selectedCamExamId}
        onSelectExam={(id) => setSelectedCamExamId(id)}
        viewingArchived={camViewingArchived}
        onToggleArchived={() => { setCamViewingArchived((v) => !v); setSelectedCamExamId(''); }}
      />

      <Box sx={{ flex: 1, p: { xs: 1.5, sm: 3 }, overflowY: 'auto', minWidth: 0 }}>
        {!selectedCamExamId ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
            <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
              <CameraAltIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to view cameras</Typography>
            <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>Choose an exam from the sidebar to view its CCTV camera links.</Typography>
          </Box>
        ) : (
          <>
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'flex-start' }, mb: 2, flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
                    {selectedCamExamData ? `${selectedCamExamData.exam_name} (${selectedCamExamData.exam_body})` : 'Cameras'}
                  </Typography>
                  {selectedCamExamData && <Chip label={camExamLinkType || selectedCamExamData.link_type} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px', bgcolor: isHLS ? '#3b82f6' : '#a4b5fe', color: isHLS ? '#fff' : '#384b91' }} />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>{camTotal} camera{camTotal !== 1 ? 's' : ''} • {isHLS ? 'HLS streams' : 'RTSP streams'}</Typography>
                  {camVisionSummary?.started_at && (() => {
                    const today = new Date().toISOString().slice(0, 10);
                    const startedToday = camVisionSummary.started_at.startsWith(today);
                    const workersActive = startedToday && (camVisionSummary.duration_minutes ?? 0) < 600;
                    const durMins = camVisionSummary.duration_minutes;
                    const durStr = durMins == null ? null
                      : durMins >= 60
                        ? `${Math.floor(durMins / 60)}h ${durMins % 60}m`
                        : `${durMins} min`;
                    return (
                      <>
                        <Typography sx={{ fontSize: '0.9rem', color: '#cbd5e1' }}>·</Typography>
                        <Typography sx={{ fontSize: '0.85rem', color: '#64748b' }}>
                          Last classification:{' '}
                          <Box component="span" sx={{ color: '#0369a1', fontWeight: 600 }}>
                            {format(new Date(camVisionSummary.started_at), 'dd MMM, HH:mm')}
                          </Box>
                          {durStr && (
                            <Box component="span">
                              {' '}·{' '}
                              <Box component="span" sx={{ fontWeight: 600, color: workersActive ? '#d97706' : '#0369a1' }}>
                                Time : {durStr}
                              </Box>
                            </Box>
                          )}
                        </Typography>
                      </>
                    );
                  })()}
                </Box>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                <TextField
                  size="small" placeholder="Search center, state..." value={camSearchQuery} onChange={(e) => setCamSearchQuery(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>, endAdornment: camSearchQuery !== camDebouncedSearch ? <InputAdornment position="end"><CircularProgress size={16} sx={{ color: '#94a3b8' }} /></InputAdornment> : null, sx: { borderRadius: '8px', bgcolor: '#f8fafc', height: 40, fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } } }}
                  sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', sm: 300 } }}
                />
                {camRegionOptions.length > 0 && (
                  <FormControl size="small" sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, minWidth: { sm: 130 } }}>
                    <Select value={camFilterRegion} onChange={(e) => { setCamFilterRegion(e.target.value); setCamPage(0); }} displayEmpty sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9', height: 40, '& fieldset': { border: '1px solid #e2e8f0' } }} renderValue={(v) => v || 'All regions'}>
                      <MenuItem value="">All regions</MenuItem>
                      {camRegionOptions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                {/* Date, then shift. HLS: the camera rows of that date/shift. RTSP: the shift filter appears
                    once a date is picked and limits the list to the centres scheduled in that date + shift. */}
                <Box sx={{ position: 'relative', flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, minWidth: { sm: 150 } }}>
                  <TextField type="date" size="small" value={camFilterExamDate ? camFilterExamDate.split('-').reverse().join('-') : ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      // typed dates outside the exam period are ignored (the picker already greys them out)
                      if (val && ((examStartIso && val < examStartIso) || (examEndIso && val > examEndIso))) return;
                      if (val) { const [y, m, d] = val.split('-'); setCamFilterExamDate(`${d}-${m}-${y}`); } else setCamFilterExamDate('');
                      if (!isHLS) setCamFilterShiftId('');   // RTSP: a new date means choosing the shift again
                      setCamPage(0);
                    }}
                    inputProps={{ min: examStartIso || undefined, max: examEndIso || undefined }}
                    InputProps={{ sx: { borderRadius: '8px', bgcolor: '#f1f5f9', height: 40, fontSize: 14, color: camFilterExamDate ? 'transparent' : '#94a3b8', paddingRight: '6px', '& fieldset': { border: '1px solid #e2e8f0' }, '& input::-webkit-datetime-edit': { opacity: camFilterExamDate ? 0 : 1 } } }} sx={{ width: '100%' }} />
                  {camFilterExamDate && <Box sx={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#334155', pointerEvents: 'none' }}>{camFilterExamDate}</Box>}
                </Box>
                {(isHLS || camFilterExamDate) && (
                  <Tooltip arrow disableHoverListener={isHLS} title="Only the cameras of the centres scheduled on this date and shift">
                    <FormControl size="small" sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, minWidth: { sm: 130 } }}>
                      <Select value={camFilterShiftId} onChange={(e) => { setCamFilterShiftId(e.target.value); setCamPage(0); }} displayEmpty sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9', height: 40, '& fieldset': { border: '1px solid #e2e8f0' } }} renderValue={(v) => v ? camShifts.find(s => s.id === v)?.shift_name || v : 'All shifts'}>
                        <MenuItem value="">All shifts</MenuItem>
                        {camShifts.map(s => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                      </Select>
                    </FormControl>
                  </Tooltip>
                )}

                <Tooltip title="Download HLS Template">
                  <Button variant="outlined" size="small" startIcon={<Download />}
                    onClick={() => handleDownloadTemplate('hls')}
                    sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, height: 40, borderColor: '#3b82f6', color: '#3b82f6', '&:hover': { bgcolor: '#eff6ff' }, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    HLS
                  </Button>
                </Tooltip>
                <Tooltip title="Download RTSP Template">
                  <Button variant="outlined" size="small" startIcon={<Download />}
                    onClick={() => handleDownloadTemplate('rtsp')}
                    sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, height: 40, borderColor: '#6366f1', color: '#6366f1', '&:hover': { bgcolor: '#eef2ff' }, textTransform: 'none', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    RTSP
                  </Button>
                </Tooltip>
              </Box>
            </Box>

            {!isHLS && camFilterExamDate && !camFilterShiftId && (
              <Alert severity="info" sx={{ mb: 2 }}>Pick a shift to see only the centres scheduled on this date.</Alert>
            )}
            {!isHLS && camScheduleInfo && (
              <Alert severity={camScheduleInfo.applied && !camScheduleInfo.exam_runs ? 'warning' : 'info'} sx={{ mb: 2 }}>
                {!camScheduleInfo.applied
                  ? 'No centre schedule is set for this exam, so every camera is shown.'
                  : !camScheduleInfo.exam_runs
                    ? `The exam does not run on ${camScheduleInfo.date} in this shift — no cameras are scheduled.`
                    : camScheduleInfo.centres != null
                      ? `Showing only the cameras of the ${camScheduleInfo.centres} centres scheduled on ${camScheduleInfo.date} in this shift.`
                      : 'Every centre runs on this date and shift.'}
              </Alert>
            )}
            {cameras.length > 0 && cameras.some(cam => cam.status !== null && cam.status !== undefined) && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => downloadStatusSheet('accessible')}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }, height: 32, px: 2, borderRadius: 2, borderColor: '#3b82f6', color: '#3b82f6', textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#eff6ff' } }}
                >
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mr: 1, whiteSpace: 'nowrap' }}>Accessible</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{camStatusCounts.accessible}</Typography>
                </Button>

                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => downloadStatusSheet('notAccessible')}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }, height: 32, px: 2, borderRadius: 2, borderColor: '#333', color: '#333', textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#f3f4f6' } }}
                >
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mr: 1, whiteSpace: 'nowrap' }}>Not Accessible</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{camStatusCounts.notAccessible}</Typography>
                </Button>

                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => downloadStatusSheet('total')}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }, height: 32, px: 2, borderRadius: 2, borderColor: '#16a34a', color: '#16a34a', textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#f0fdf4' } }}
                >
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mr: 1, whiteSpace: 'nowrap' }}>Total</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{camStatusCounts.accessible + camStatusCounts.notAccessible + camStatusCounts.unknown}</Typography>
                </Button>

                {camStatusCounts.unknown > 0 && (
                  <Box sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }, height: 32, px: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, borderRadius: 2, border: '1px solid #e5e7eb', bgcolor: '#f9fafb', whiteSpace: 'nowrap' }}>
                    <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', fontWeight: 600, whiteSpace: 'nowrap' }}>Unknown</Typography>
                    <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>{camStatusCounts.unknown}</Typography>
                  </Box>
                )}
              </Box>
            )}

            {camLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : sortedCameras.length > 0 ? (
              <>
                <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none', maxWidth: '100%', overflowX: 'auto' }}>
                  <Table size="small">
                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                      <TableRow>
                        {isHLS ? (
                          <>
                            {['centre_name', 'tc_code', 'state', 'camera_name', 'ch_code', 'camera_category', 'classification', 'status', 'exam_date', 'shift_name'].map((col) => (
                              <TableCell key={col} sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>
                                <TableSortLabel active={camOrderBy === col} direction={camOrderBy === col ? camOrder : 'asc'} onClick={() => handleCamSort(col)}>
                                  {formatColumnLabel(col)}
                                </TableSortLabel>
                              </TableCell>
                            ))}
                          </>
                        ) : (
                          <>
                            {['device_id', 'camera_no', 'tc_code', 'camera_name', 'centre_name', 'state', 'region', 'classification', 'status'].map((col) => (
                              <TableCell key={col} sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>
                                <TableSortLabel active={camOrderBy === col} direction={camOrderBy === col ? camOrder : 'asc'} onClick={() => handleCamSort(col)}>
                                  {formatColumnLabel(col)}
                                </TableSortLabel>
                              </TableCell>
                            ))}
                          </>
                        )}
                        <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Frame</TableCell>
                        <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 200 }}>CCTV URL</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {sortedCameras.map((cam) => (
                        <TableRow key={cam.id} hover sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                          {isHLS ? (
                            <>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.centre_name || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.tc_code || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.state || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_name || '-'}</TableCell>
                              <TableCell>{cam.ch_code ? <Chip label={cam.ch_code} size="small" variant="outlined" /> : '-'}</TableCell>
                              <TableCell><Chip label={cam.camera_category || 'N/A'} size="small" /></TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                  {cam.classification || '-'}
                                  {cam.manually_verified ? (
                                    <Tooltip title="Manually verified by an operator">
                                      <CheckCircleIcon sx={{ fontSize: 14, color: '#16a34a' }} />
                                    </Tooltip>
                                  ) : null}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  {...getStatusChipProps(cam.status)}
                                  sx={{ fontWeight: 600, fontSize: '0.72rem', ...getStatusChipProps(cam.status).sx }}
                                />
                              </TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{formatDateDDMMYYYY(cam.exam_date) || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>
                                {cam.shift_id ? (camShifts.find(s => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`) : <Chip label="All shifts" size="small" variant="outlined" />}
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.device_id || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_no ?? '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.tc_code || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_name || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.centre_name || cam.tc_name || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.state || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.region || '-'}</TableCell>
                              <TableCell sx={{ fontSize: '0.85rem' }}>
                                <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
                                  {cam.classification || '-'}
                                  {cam.manually_verified ? (
                                    <Tooltip title="Manually verified by an operator">
                                      <CheckCircleIcon sx={{ fontSize: 14, color: '#16a34a' }} />
                                    </Tooltip>
                                  ) : null}
                                </Box>
                              </TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  {...getStatusChipProps(cam.status)}
                                  sx={{ fontWeight: 600, fontSize: '0.72rem', ...getStatusChipProps(cam.status).sx }}
                                />
                              </TableCell>
                            </>
                          )}
                          <TableCell align="center">
                            <Tooltip title={cam.frame_path ? `View frame (${cam.classification || 'unclassified'})` : 'No frame captured yet'}>
                              <span>
                                <IconButton
                                  size="small"
                                  disabled={!cam.frame_path}
                                  onClick={() => { setPreviewError(false); setPreviewCamera(cam); }}
                                  sx={{ color: cam.frame_path ? 'primary.main' : '#cbd5e1' }}
                                >
                                  <VisibilityIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </TableCell>
                          <TableCell sx={{ maxWidth: 200 }}>
                            <Tooltip title={cam.cctv_url || cam.url}>
                              <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.75rem' }}>
                                {truncate(cam.cctv_url || cam.url, 40)}
                              </Typography>
                            </Tooltip>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination component="div" count={camTotal} page={camPage} onPageChange={(e, newPage) => setCamPage(newPage)} rowsPerPage={camRowsPerPage} onRowsPerPageChange={(e) => { setCamRowsPerPage(parseInt(e.target.value, 10)); setCamPage(0); }} rowsPerPageOptions={[15, 25, 50, 100, 200]}
                  sx={{
                    '.MuiTablePagination-toolbar': { pl: { xs: 0, sm: 2 }, flexWrap: 'wrap' },
                    '.MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
                  }}
                />
              </>
            ) : (
              <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e8ecf1' }}><Typography sx={{ fontSize: '0.95rem', color: '#64748b' }}>No cameras found for this exam.</Typography></Box>
            )}
          </>
        )}
      </Box>

      {/* ── Frame preview Dialog (read-only) ── */}
      <Dialog
        open={!!previewCamera}
        onClose={() => setPreviewCamera(null)}
        maxWidth="md"
        fullWidth
        fullScreen={isSmDown}
      >
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, pr: 6 }}>
          <VisibilityIcon fontSize="small" />
          <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <Typography sx={{ fontWeight: 700, fontSize: '1rem', color: '#0f172a', lineHeight: 1.3 }}>
              {previewCamera?.camera_name || previewCamera?.ch_code || previewCamera?.device_id || 'Camera frame'}
            </Typography>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
              {previewCamera?.classification && (
                <Chip
                  icon={previewCamera?.manually_verified ? <CheckCircleIcon sx={{ fontSize: '14px !important', color: '#16a34a !important' }} /> : undefined}
                  label={`Classification: ${previewCamera.classification}`}
                  size="small"
                  color="primary"
                  variant="outlined"
                  sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                />
              )}
              {previewCamera?.manually_verified && (
                <Chip label="Manually verified" size="small" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#dcfce7', color: '#16a34a' }} />
              )}
              {previewCamera?.camera_category && (
                <Chip label={`Category: ${previewCamera.camera_category}`} size="small" sx={{ fontWeight: 600, fontSize: '0.7rem' }} />
              )}
              {previewCamera?.centre_name && (
                <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>{previewCamera.centre_name}</Typography>
              )}
            </Box>
          </Box>
        </DialogTitle>
        <DialogContent dividers sx={{ bgcolor: '#f8fafc', p: 2 }}>
          {previewCamera && (
            previewError || !buildFrameImageUrl(previewCamera.frame_path) ? (
              <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, color: '#94a3b8' }}>
                <ImageNotSupportedIcon sx={{ fontSize: 48, mb: 1.5 }} />
                <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>Image not available</Typography>
                <Typography sx={{ fontSize: '0.78rem', mt: 0.5 }}>The captured frame could not be loaded.</Typography>
              </Box>
            ) : (
              <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                <Box
                  component="img"
                  src={buildFrameImageUrl(previewCamera.frame_path)}
                  alt={previewCamera.camera_name || 'frame'}
                  onError={() => setPreviewError(true)}
                  sx={{ maxWidth: '100%', maxHeight: { xs: '60vh', sm: '70vh' }, borderRadius: 1.5, boxShadow: '0 2px 12px rgba(15,23,42,0.12)', bgcolor: '#000' }}
                />
              </Box>
            )
          )}
        </DialogContent>
        <DialogActions sx={{ px: 2, py: 1.5, gap: 1 }}>
          {previewCamera?.frame_path && !previewError && (
            <Button onClick={() => window.open(buildFrameImageUrl(previewCamera.frame_path), '_blank', 'noopener')} size="small">
              Open in new tab
            </Button>
          )}
          <Button onClick={() => setPreviewCamera(null)} variant="contained" size="small">Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ClientCameras;

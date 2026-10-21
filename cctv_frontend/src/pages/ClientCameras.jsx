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
  Menu,
  Drawer,
  ListItemText,
  Divider,
} from '@mui/material';
import {
  Search,
  Download,
  Visibility as VisibilityIcon,
  CheckCircle as CheckCircleIcon,
  ImageNotSupported as ImageNotSupportedIcon,
  MoreVert as MoreVertIcon,
  InfoOutlined as InfoOutlinedIcon,
  EventBusy as EventBusyIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  ErrorOutline as ErrorOutlineIcon,
  Close as CloseIcon,
  Videocam as VideocamIcon,
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


/* Accent colours per link type (same palette as the RTSP / HLS chips): HLS = app blue, RTSP = periwinkle + navy text. */
const TYPE_THEME = {
  hls:  { solid: '#3c81f6', onSolid: '#ffffff', solidHover: '#2f6fdb', text: '#1d4ed8', border: '#3c81f6', soft: '#eff6ff' },
  rtsp: { solid: '#a4b5fe', onSolid: '#384b91', solidHover: '#93a6fd', text: '#384b91', border: '#a4b5fe', soft: '#eef0ff' },
};

/* One row of the Download / template menus: coloured icon tile, title + hint, count pill. */
const DlItem = ({ icon, color, bg, title, sub, count, onClick, disabled }) => (
  <MenuItem onClick={onClick} disabled={disabled} sx={{ gap: 1.5, py: 1, px: 1.25, mx: 0.75, my: 0.25, borderRadius: 1.75, alignItems: 'center', '&:hover': { bgcolor: '#f1f5f9' } }}>
    <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography sx={{ fontSize: '0.88rem', fontWeight: 600, color: '#0f172a', lineHeight: 1.25 }}>{title}</Typography>
      {sub && <Typography sx={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3 }}>{sub}</Typography>}
    </Box>
    {count != null && (
      <Box sx={{ px: 1.1, py: 0.2, borderRadius: '999px', bgcolor: bg, color, fontSize: '0.78rem', fontWeight: 700 }}>{Number(count).toLocaleString()}</Box>
    )}
  </MenuItem>
);
const MENU_PAPER = { sx: { mt: 0.75, borderRadius: 3, minWidth: { xs: 250, sm: 300 }, maxWidth: 'calc(100vw - 24px)', py: 0.75, boxShadow: '0 16px 40px rgba(15,23,42,0.18)', border: '1px solid #e2e8f0' } };
const MENU_HEAD = { px: 2.25, pt: 0.75, pb: 0.5, fontSize: '0.66rem', fontWeight: 700, letterSpacing: '0.09em', color: '#94a3b8' };

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
  const [camDayInfo, setCamDayInfo] = useState(null);   // is the chosen date an exam day
  const [camServerStats, setCamServerStats] = useState(null);      // RTSP: not-accessible cameras per camview server
  const [dlAnchor, setDlAnchor] = useState(null);                 // Download Cameras menu
  const [tplAnchor, setTplAnchor] = useState(null);               // template (3-dot) menu
  const [dvOpen, setDvOpen] = useState(false);                    // DV details side panel
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
      setCamDayInfo(res.data.day || null);
      setCamServerStats(res.data.serverStats || null);
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
  const tc = isHLS ? TYPE_THEME.hls : TYPE_THEME.rtsp;   // accent colours of this exam's link type
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
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 2, flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 2 }}>
              <Box sx={{ minWidth: 0, flex: { md: '1 1 0' } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'nowrap', minWidth: 0 }}>
                  <Tooltip title={selectedCamExamData ? `${selectedCamExamData.exam_name} (${selectedCamExamData.exam_body})` : ''} arrow placement="bottom-start">
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.5rem' }, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedCamExamData ? `${selectedCamExamData.exam_name} (${selectedCamExamData.exam_body})` : 'Cameras'}
                    </Typography>
                  </Tooltip>
                  {selectedCamExamData && <Chip label={camExamLinkType || selectedCamExamData.link_type} size="small" sx={{ flexShrink: 0, fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px', bgcolor: isHLS ? '#3b82f6' : '#a4b5fe', color: isHLS ? '#fff' : '#384b91' }} />}
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

              {/* Far-right: Download Cameras / template menu */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                <Button variant="contained" disableElevation startIcon={<Download />} endIcon={<KeyboardArrowDownIcon />}
                  onClick={(e) => setDlAnchor(e.currentTarget)}
                  sx={{ height: 40, flex: { xs: '1 1 auto', sm: '0 0 auto' }, textTransform: 'none', fontWeight: 600, borderRadius: 2 }}>
                  Download Cameras
                </Button>
                <Tooltip title="Download link templates">
                  <IconButton onClick={(e) => setTplAnchor(e.currentTarget)}
                    sx={{ width: 40, height: 40, borderRadius: 2, border: `1px solid ${tc.border}`, color: tc.text, '&:hover': { bgcolor: tc.soft } }}>
                    <MoreVertIcon />
                  </IconButton>
                </Tooltip>
                <Menu anchorEl={dlAnchor} open={Boolean(dlAnchor)} onClose={() => setDlAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  PaperProps={MENU_PAPER} MenuListProps={{ sx: { py: 0 } }}>
                  <Typography sx={MENU_HEAD}>DOWNLOAD (EXCEL) · SELECTED DATE / SHIFT</Typography>
                  <DlItem icon={<CheckCircleIcon sx={{ fontSize: 20 }} />} color={tc.text} bg={tc.soft}
                    title="Accessible" sub="Reachable in the last check" count={camStatusCounts.accessible}
                    disabled={!camStatusCounts.accessible} onClick={() => { setDlAnchor(null); downloadStatusSheet('accessible'); }} />
                  <DlItem icon={<ErrorOutlineIcon sx={{ fontSize: 20 }} />} color="#dc2626" bg="#fef2f2"
                    title="Not Accessible" sub="Cameras that could not be reached" count={camStatusCounts.notAccessible}
                    disabled={!camStatusCounts.notAccessible} onClick={() => { setDlAnchor(null); downloadStatusSheet('notAccessible'); }} />
                  <DlItem icon={<VideocamIcon sx={{ fontSize: 20 }} />} color="#16a34a" bg="#f0fdf4"
                    title="Total" sub={camStatusCounts.unknown > 0 ? `Incl. ${camStatusCounts.unknown.toLocaleString()} not checked yet` : "Every camera in this view"} count={camStatusCounts.accessible + camStatusCounts.notAccessible + camStatusCounts.unknown}
                    disabled={!(camStatusCounts.accessible + camStatusCounts.notAccessible + camStatusCounts.unknown)} onClick={() => { setDlAnchor(null); downloadStatusSheet('total'); }} />
                </Menu>
                <Menu anchorEl={tplAnchor} open={Boolean(tplAnchor)} onClose={() => setTplAnchor(null)}
                  anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                  PaperProps={MENU_PAPER} MenuListProps={{ sx: { py: 0 } }}>
                  <Typography sx={MENU_HEAD}>LINK TEMPLATES</Typography>
                  {(isHLS ? ['hls', 'rtsp'] : ['rtsp', 'hls']).map((t) => (
                    <DlItem key={t} icon={<Download sx={{ fontSize: 20 }} />}
                      color={TYPE_THEME[t].text} bg={TYPE_THEME[t].soft}
                      title={`${t.toUpperCase()} template`} sub={(t === 'hls') === isHLS ? "This exam's link type" : 'Excel format for uploading links'}
                      onClick={() => { setTplAnchor(null); handleDownloadTemplate(t); }} />
                  ))}
                </Menu>
              </Box>
            </Box>

            {/* Filters row */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
                <TextField
                  size="small" placeholder="Search center, state..." value={camSearchQuery} onChange={(e) => setCamSearchQuery(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>, endAdornment: camSearchQuery !== camDebouncedSearch ? <InputAdornment position="end"><CircularProgress size={16} sx={{ color: '#94a3b8' }} /></InputAdornment> : null, sx: { borderRadius: '8px', bgcolor: '#f8fafc', height: 40, fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } } }}
                  sx={{ flex: { xs: '1 1 100%', sm: '1 1 260px' }, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', sm: 420 } }}
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

            </Box>

            {/* Info row: schedule note (left) + not-accessible cameras per DV (right, RTSP only; HLS shows just the schedule note) */}
            {(() => {
              const needShift = camFilterExamDate && !camFilterShiftId;
              const fmtDay = (d) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };
              let left = null, leftTip = '', warn = false;
              if (camFilterShiftId && !camFilterExamDate) {
                left = 'Pick a date to see the total centres scheduled in this shift';
                leftTip = 'Total centres is shown for a date + shift. Choose an exam date as well.';
              } else if (needShift) {
                left = 'Pick a shift to see only the centres scheduled on this date';
                leftTip = 'Choose a shift to limit the list to the centres scheduled on this date and shift.';
              } else if (camScheduleInfo) {
                if (!camScheduleInfo.applied) {
                  left = 'No centre schedule is set - every camera is shown';
                  leftTip = 'No centre schedule is set for this exam, so every camera is shown.';
                } else if (!camScheduleInfo.exam_runs) {
                  left = `Exam does not run on ${fmtDay(camScheduleInfo.date)} in this shift`; warn = true;
                  leftTip = `The exam does not run on ${camScheduleInfo.date} in this shift — no cameras are scheduled.`;
                } else if (camScheduleInfo.centres != null) {
                  left = `Total centres: ${camScheduleInfo.centres} (${fmtDay(camScheduleInfo.date)})`;
                  leftTip = `Showing only the cameras of the ${camScheduleInfo.centres} centres scheduled on ${camScheduleInfo.date} in this shift.`;
                } else {
                  left = 'Every centre runs on this date and shift'; leftTip = left;
                }
              }
              const nDv = camServerStats?.servers?.length || 0;
              const nNot = camServerStats?.totalNotAccessible || 0;
              const allOk = nNot === 0 && camStatusCounts.accessible > 0 && camStatusCounts.notAccessible === 0 && camStatusCounts.unknown === 0;
              const unchecked = nNot === 0 && !allOk && (camStatusCounts.accessible + camStatusCounts.notAccessible + camStatusCounts.unknown) > 0;
              const showRight = !isHLS && (nNot > 0 || allOk || unchecked);
              if (!left && !showRight) return null;
              return (
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'stretch' }}>
                  {left && (
                    <Box sx={{ flex: '1 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderRadius: 2,
                      bgcolor: warn ? '#fffbeb' : '#eff6ff', color: warn ? '#92400e' : '#1e3a8a' }}>
                      <Tooltip title={leftTip} arrow placement="bottom-start">
                        <InfoOutlinedIcon sx={{ fontSize: 22, color: warn ? '#d97706' : '#2563eb', cursor: 'help' }} />
                      </Tooltip>
                      <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{left}</Typography>
                    </Box>
                  )}
                  {showRight && (
                  <Box sx={{ flex: '1 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderRadius: 2,
                    bgcolor: nNot > 0 ? '#fef2f2' : allOk ? '#f0fdf4' : '#f8fafc', color: nNot > 0 ? '#7f1d1d' : allOk ? '#14532d' : '#475569' }}>
                    {nNot > 0 ? (
                      <>
                        <Tooltip title="Show the not-accessible cameras per DV (camview server)" arrow>
                          <IconButton size="small" onClick={() => setDvOpen(true)} sx={{ p: 0 }}>
                            <ErrorOutlineIcon sx={{ fontSize: 24, color: '#dc2626' }} />
                          </IconButton>
                        </Tooltip>
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
                          {nNot.toLocaleString()} non-accessible camera{nNot !== 1 ? 's' : ''} in {nDv} DV{nDv !== 1 ? 's' : ''}
                        </Typography>
                      </>
                    ) : allOk ? (
                      <>
                        <CheckCircleIcon sx={{ fontSize: 22, color: '#16a34a' }} />
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>All cameras in this view were accessible in the last check</Typography>
                      </>
                    ) : (
                      <>
                        <InfoOutlinedIcon sx={{ fontSize: 22, color: '#64748b' }} />
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>Accessibility not checked yet{camStatusCounts.unknown ? ` - ${camStatusCounts.unknown.toLocaleString()} camera${camStatusCounts.unknown !== 1 ? 's' : ''} unchecked` : ''}</Typography>
                      </>
                    )}
                  </Box>
                  )}
                </Box>
              );
            })()}

            {/* DV details side panel */}
            <Drawer anchor="right" open={dvOpen} onClose={() => setDvOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 340 }, p: 2.5, bgcolor: '#f8fafc' } }}>
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography sx={{ fontWeight: 700, fontSize: '1.15rem', color: '#0f172a' }}>DV Details</Typography>
                <IconButton size="small" onClick={() => setDvOpen(false)}><CloseIcon /></IconButton>
              </Box>
              <Typography sx={{ fontSize: '0.85rem', color: '#64748b', mb: 2 }}>Non-accessible cameras found in the following DVs.</Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, overflowY: 'auto' }}>
                {(camServerStats?.servers || []).map((sv) => {
                  const num = String(sv.server).replace(/^[a-z]+/i, '');
                  const all = sv.notAccessible === sv.total;
                  return (
                    <Box key={sv.server} sx={{ display: 'flex', alignItems: 'center', gap: 2, p: 1.5, borderRadius: 2, bgcolor: '#fef2f2', border: '1px solid #fecaca' }}>
                      <Typography sx={{ minWidth: 54, textAlign: 'center', fontWeight: 800, fontSize: '1.6rem', color: '#dc2626' }}>{sv.notAccessible}</Typography>
                      <Box sx={{ borderLeft: '1px solid #fca5a5', pl: 2 }}>
                        <Typography sx={{ fontWeight: 700, color: '#0f172a' }}>{/^\d+$/.test(num) ? `DV ${num}` : sv.server}</Typography>
                        <Chip size="small" label={all ? 'All non-accessible' : `of ${sv.total} cameras`}
                          sx={{ mt: 0.5, height: 22, fontSize: '0.72rem', fontWeight: 600, bgcolor: all ? '#fee2e2' : '#fff', color: '#b91c1c' }} />
                      </Box>
                    </Box>
                  );
                })}
                {(!camServerStats?.servers || camServerStats.servers.length === 0) && (
                  <Typography sx={{ color: '#64748b', fontSize: '0.9rem' }}>No non-accessible cameras in this view.</Typography>
                )}
              </Box>
            </Drawer>

            {camLoading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : (camDayInfo?.runs === false || (camScheduleInfo?.applied && !camScheduleInfo.exam_runs)) ? (
              <Box sx={{ textAlign: 'center', py: 8, px: 2, border: '1px dashed #cbd5e1', borderRadius: 3, bgcolor: '#f8fafc' }}>
                <EventBusyIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
                <Typography sx={{ fontWeight: 700, color: '#334155', fontSize: '1.05rem' }}>
                  No exam cameras are scheduled on {camFilterExamDate}{camFilterShiftId ? ' in this shift' : ''}
                </Typography>
                <Typography sx={{ color: '#64748b', mt: 0.5, fontSize: '0.9rem' }}>
                  Choose another date{camFilterShiftId ? ' or shift' : ''} to see the cameras.
                </Typography>
              </Box>
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

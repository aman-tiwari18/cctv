import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Chip,
  CircularProgress, Alert, Tooltip, Divider, Stack, TablePagination,
  FormControl, InputLabel, Select, InputAdornment, TableSortLabel,
  useMediaQuery, useTheme, Autocomplete, Checkbox, ListItemText, Popover, Menu, Drawer,
} from '@mui/material';
import {
  Add, Edit, Delete, Upload, CloudUpload, Download,
  TableChart, Search,
  Videocam as VideocamIcon,
  Visibility as VisibilityIcon,
  ImageNotSupported as ImageNotSupportedIcon,
  CheckCircle as CheckCircleIcon,
  VerifiedRounded as VerifiedRoundedIcon,
  FilterAltOff as FilterAltOffIcon,
  Tune as TuneIcon,
  Close as CloseIcon,
  MoreVert as MoreVertIcon,
  InfoOutlined as InfoOutlinedIcon,
  EventBusy as EventBusyIcon,
  KeyboardArrowDown as KeyboardArrowDownIcon,
  ErrorOutline as ErrorOutlineIcon,
} from '@mui/icons-material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { format } from 'date-fns';
import { camerasAPI, examsAPI, executionsAPI } from '../services/api';
import { IMG_BASE } from '../constants/data';
import * as XLSX from 'xlsx';
import { useAuth } from '../contexts/AuthContext';
import ExamSidebar from '../components/ExamSidebar';


const truncate = (str, n = 40) =>
  str && str.length > n ? str.slice(0, n) + '…' : str;

const formatDateDDMMYYYY = (dateStr) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
};

const parseDDMMYYYYToISO = (value) => {
  if (!value) return '';
  const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
  if (!match) return value;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
};

const parseDDMMYYYYToDate = (value) => {
  if (!value) return null;
  const match = /^([0-3]\d)-([0-1]\d)-(\d{4})$/.exec(value);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return new Date(yyyy, mm - 1, dd);
};

// Stored frame_path examples (absolute, may originate from different worker FS roots):
//   /data/cctv_dev/cctv/script-server/scripts/detection/results/classification_frames/assignment_X/foo.jpg
//   /app/scripts/detection/results/classification_frames/assignment_X/foo.jpg
// The script-server serves /serve-rtsp-detection-images/{path} relative to
// <SCRIPTS_DIR>/detection/results, so we strip everything before
// "classification_frames/" to build the URL.
const buildFrameImageUrl = (framePath) => {
  if (!framePath) return '';
  const marker = 'classification_frames/';
  const idx = framePath.indexOf(marker);
  if (idx === -1) return '';
  const relative = framePath.slice(idx);
  return `${IMG_BASE}/serve-rtsp-detection-images/${relative}`;
};

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

// Temporarily hidden per request — flip to true to bring the Classification
// filter dropdown back.
const SHOW_CLASSIFICATION_FILTER = false;

// A classification run is identified by the shift it was run for + its start time.
const runKey = (r) => `${r.shift_id ?? ''}|${r.started_at}`;

const HLS_EMPTY = {
  centre_name: '', tc_code: '', city: '', state: '',
  camera_name: '', ch_code: '', cctv_url: '', camera_category: '',
  classification: '', exam_date: '', shift_id: '',
};
const RTSP_EMPTY = {
  device_id: '', tc_code: '', camera_name: '', centre_name: '',
  city: '', state: '', region: '', cctv_url: '', classification: '',
};

// ─────────────────────────────────────────────────────────────

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

const Cameras = () => {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchParams] = useSearchParams();
  const examIdParam = searchParams.get('exam');

  /* ── Sidebar ── */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Collapse the exam rail by default on phones so the content panel keeps full width.
  useEffect(() => { setSidebarOpen(!isSmDown); }, [isSmDown]);
  const [exams, setExams] = useState([]);
  const [viewingArchived, setViewingArchived] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState(examIdParam || '');
  // exam whose default date was already applied (so clearing the date by hand is respected)
  const defaultDateFor = useRef(null);


  const [cameras, setCameras] = useState([]);
  const [examLinkType, setExamLinkType] = useState(null);
  // RTSP: what the exam schedule did to the list for the chosen date + shift / run (null = nothing chosen)
  const [scheduleInfo, setScheduleInfo] = useState(null);
  const [serverStats, setServerStats] = useState(null);          // RTSP: not-accessible cameras per camview server
  const [dlAnchor, setDlAnchor] = useState(null);                 // Download Cameras menu
  const [tplAnchor, setTplAnchor] = useState(null);               // template (3-dot) menu
  const [dvOpen, setDvOpen] = useState(false);                    // DV details side panel
  const [loading, setLoading] = useState(false);
  const [statusCounts, setStatusCounts] = useState({ accessible: 0, notAccessible: 0, unknown: 0 });
  const [visionSummary, setVisionSummary] = useState(null);

  /* ── Search & Sort ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [order, setOrder] = useState('asc');

  const [filterShiftId, setFilterShiftId] = useState('');
  const [filterExamDate, setFilterExamDate] = useState('');
  const [filterClassification, setFilterClassification] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  // Cameras-tab filters (server side): status, manual verification, classification(s), centre(s).
  const [filterStatus, setFilterStatus] = useState('');          // '' | accessible | not_accessible | unknown
  const [filterVerified, setFilterVerified] = useState('');      // '' | yes | no
  const [filterClasses, setFilterClasses] = useState([]);        // values; '__unclassified__' = no label
  const [filterCentres, setFilterCentres] = useState([]);        // [{value,label,count}]
  const [facets, setFacets] = useState(null);                    // options + counts from the API
  const [advAnchor, setAdvAnchor] = useState(null);              // Advanced filter panel anchor

  /* ── Classification run picker ── */
  const [classificationRuns, setClassificationRuns] = useState([]);
  const [selectedRunKey, setSelectedRunKey] = useState(''); // runKey(run) = "<shift_id>|<started_at>", or '' = latest/live
  const userPickedRun = useRef(false);
  const [dayInfo, setDayInfo] = useState(null);           // backend: is the chosen date an exam day (+ cameras / centres scheduled)   // once the user picks a run (or 'Latest (live)') stop auto-selecting the newest run


  const [page, setPage] = useState(0);
  // Default to 15 rows on mobile (<sm), 50 on larger screens. Read the real
  // viewport width at mount (reliable in this client-only app, unlike
  // useMediaQuery's first-render value).
  const [rowsPerPage, setRowsPerPage] = useState(() => (window.innerWidth < theme.breakpoints.values.sm ? 15 : 50));
  const [totalCount, setTotalCount] = useState(0);

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
        setRowsPerPage(isMobile ? 15 : 50);
        setPage(0);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [theme]);


  const [openDialog, setOpenDialog] = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [formData, setFormData] = useState(HLS_EMPTY);
  const [formError, setFormError] = useState('');


  const [openUpload, setOpenUpload] = useState(false);
  const [uploadFile, setUploadFile] = useState(null);
  const [uploadShiftId, setUploadShiftId] = useState('');
  const [uploadDate, setUploadDate] = useState('');
  const [uploadError, setUploadError] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  /* ── Frame preview dialog ── */
  const [previewCamera, setPreviewCamera] = useState(null);
  const [previewError, setPreviewError] = useState(false);

  /* ── Operator manual-verify ── */
  const { user } = useAuth();
  const isVerifier = user?.role === 'OPERATOR' || user?.role === 'ADMIN';
  const [classOptions, setClassOptions] = useState([]);
  const [regionOptions, setRegionOptions] = useState([]);
  const [verifyChoice, setVerifyChoice] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  useEffect(() => { loadExams(); }, [viewingArchived]);

  const loadExams = async () => {
    try {
      const res = await examsAPI.getAll({ is_active: true });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setExams(list);
    } catch (e) { console.error(e); }
  };

  /* ── Debounce search query ── */
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 500); // 500ms delay

    return () => clearTimeout(timer);
  }, [searchQuery]);


  const loadVisionSummary = useCallback(() => {
    if (!selectedExamId) return;
    executionsAPI.getVisionSummary({ exam_id: selectedExamId })
      .then((res) => setVisionSummary(res?.data?.data || null))
      .catch(() => setVisionSummary(null));
  }, [selectedExamId]);

  useEffect(() => {
    if (selectedExamId) {
      loadCameras();
      loadVisionSummary();
      loadClassificationRuns();
    } else {
      setCameras([]);
      setTotalCount(0);
      setVisionSummary(null);
      setClassificationRuns([]);
    }
    setFilterShiftId('');
    setFilterExamDate('');
    defaultDateFor.current = null;          // pick the default date again for this exam
    setFilterClassification('');
    setFilterRegion('');
    setFilterStatus('');
    setFilterVerified('');
    setFilterClasses([]);
    setFilterCentres([]);
    setSelectedRunKey('');
    userPickedRun.current = false;
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setPage(0);
  }, [selectedExamId]);

  const loadClassificationRuns = useCallback(() => {
    if (!selectedExamId) return;
    camerasAPI.getClassificationRuns(selectedExamId)
      .then((res) => {
        const list = Array.isArray(res?.data?.data) ? res.data.data : [];
        setClassificationRuns(list);
      })
      .catch(() => setClassificationRuns([]));
  }, [selectedExamId]);

  /* Re-fetch vision summary every 60s if started today and workers may still be active */
  useEffect(() => {
    if (!visionSummary?.started_at) return;
    const today = new Date().toISOString().slice(0, 10);
    const startedToday = visionSummary.started_at.startsWith(today);
    const durationShort = (visionSummary.duration_minutes ?? 0) < 600;
    if (!startedToday || !durationShort) return;
    const timer = setInterval(loadVisionSummary, 60_000);
    return () => clearInterval(timer);
  }, [visionSummary, loadVisionSummary]);

  useEffect(() => {
    if (selectedExamId) loadCameras();
  }, [page, rowsPerPage, filterShiftId, filterExamDate, filterClassification, filterRegion, filterStatus, filterVerified, filterClasses, filterCentres, selectedRunKey, debouncedSearchQuery, orderBy, order]);

  /* Status / verified / classification / centre filters as API params (list + Excel download). */
  const extraFilterParams = useCallback(() => {
    const p = {};
    if (filterStatus) p.status = filterStatus;
    if (filterVerified) p.verified = filterVerified;
    if (filterClasses.length) p.classification = filterClasses.join(',');
    if (filterCentres.length) p.tc_code = filterCentres.map((c) => c.value).join(',');
    return p;
  }, [filterStatus, filterVerified, filterClasses, filterCentres]);

  const activeFilterCount = (filterStatus ? 1 : 0) + (filterVerified ? 1 : 0) + filterClasses.length
    + filterCentres.length + (searchQuery.trim() ? 1 : 0) + (filterRegion ? 1 : 0);

  const advancedFilterCount = (filterStatus ? 1 : 0) + (filterVerified ? 1 : 0) + filterClasses.length
    + filterCentres.length + (filterRegion ? 1 : 0);

  const clearAllFilters = () => {
    setFilterStatus(''); setFilterVerified(''); setFilterClasses([]); setFilterCentres([]);
    setFilterRegion(''); setSearchQuery(''); setDebouncedSearchQuery(''); setPage(0);
  };

  const loadCameras = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      const params = { is_active: true, page: page + 1, limit: rowsPerPage };
      if (filterShiftId) params.shift_id = filterShiftId;
      if (filterExamDate) params.exam_date = parseDDMMYYYYToISO(filterExamDate);
      if (filterClassification) params.classification = filterClassification;
      if (filterRegion) params.region = filterRegion;
      Object.assign(params, extraFilterParams());
      if (selectedRunKey) {
        const run = classificationRuns.find((r) => runKey(r) === selectedRunKey);
        if (run) { params.run_start = run.started_at; params.run_end = run.ended_at; if (run.shift_id != null) params.run_shift_id = run.shift_id; }
      }
      if (filterExamDate && !selectedRunKey) params.raw = '1';      // no classification ran that day: no status from another day
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      if (orderBy) { params.sort_by = orderBy; params.sort_order = order; }
      const res = await camerasAPI.getByExam(selectedExamId, params);
      setDayInfo(res.data.day || null);
      setCameras(res.data.data || []);
      setTotalCount(res.data.totalCount || (res.data.data || []).length);
      setExamLinkType(res.data.linkType);
      setScheduleInfo(res.data.schedule || null);
      setStatusCounts(res.data.statusCounts || { accessible: 0, notAccessible: 0, unknown: 0 });
      setServerStats(res.data.serverStats || null);
      setFacets(res.data.facets || null);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedExamId, page, rowsPerPage, filterShiftId, filterExamDate, filterClassification, filterRegion, extraFilterParams, selectedRunKey, classificationRuns, debouncedSearchQuery, orderBy, order]);

  /* ── Derived ── */
  const selectedExamData = exams.find((e) => String(e.id) === String(selectedExamId));

  /* ── Date filter: limited to the exam's dates, and preselected ───────────
     A running exam opens on today; an archived (or finished) exam on its last day; an exam that
     has not started yet on its first day. The calendar only enables the exam's date range. */
  const dayOf = (v) => (v ? String(v).slice(0, 10) : '');
  const examStartIso = dayOf(selectedExamData?.start_date);
  const examEndIso = dayOf(selectedExamData?.end_date);
  useEffect(() => {
    if (!selectedExamData || String(defaultDateFor.current) === String(selectedExamData.id)) return;
    defaultDateFor.current = selectedExamData.id;
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let iso;
    if (selectedExamData.is_active === false) iso = examEndIso || today;           // archived: last day
    else if (examStartIso && today < examStartIso) iso = examStartIso;             // not started: first day
    else if (examEndIso && today > examEndIso) iso = examEndIso;                   // finished: last day
    else iso = today;                                                              // running: today
    const [y, m, d] = iso.split('-');
    if (y && m && d) { setFilterExamDate(`${d}-${m}-${y}`); setPage(0); }
  }, [selectedExamData]);
  /* Classification runs follow the chosen date (and shift): only that day's runs are offered and the
     newest one is selected automatically; a day with no run shows the scheduled cameras without status. */
  const runDay = (r) => { try { return format(new Date(r.started_at), 'yyyy-MM-dd'); } catch { return ''; } };
  const filterIso = filterExamDate ? parseDDMMYYYYToISO(filterExamDate) : '';
  const runsForDay = useMemo(() => (filterIso
    ? classificationRuns.filter((r) => runDay(r) === filterIso && (!filterShiftId || String(r.shift_id) === String(filterShiftId)))
    : classificationRuns), [classificationRuns, filterIso, filterShiftId]);
  const runScopeRef = useRef('');
  useEffect(() => {
    const scope = `${filterIso}|${filterShiftId}`;
    if (runScopeRef.current !== scope) { runScopeRef.current = scope; userPickedRun.current = false; }
    if (userPickedRun.current && (selectedRunKey === '' || runsForDay.some((r) => runKey(r) === selectedRunKey))) return;
    const want = runsForDay.length ? runKey(runsForDay[0]) : '';
    if (want !== selectedRunKey) { setSelectedRunKey(want); setPage(0); }
  }, [runsForDay, filterIso, filterShiftId]);
  const noRunForDay = !!filterExamDate && !selectedRunKey;
  const noExamDay = dayInfo?.runs === false || (!!scheduleInfo && scheduleInfo.applied && !scheduleInfo.exam_runs);

  const isHLS = examLinkType === 'HLS' || selectedExamData?.link_type?.toUpperCase() === 'HLS';
  const tc = isHLS ? TYPE_THEME.hls : TYPE_THEME.rtsp;   // accent colours of this exam's link type
  const shifts = selectedExamData?.examShifts || [];

  /* All cameras in the current scope (shift / date / filters / selected classification run),
     as the table shows them, for the Excel downloads. */
  const fetchScopeCameras = async () => {
    const params = { is_active: true, page: 1, limit: 1000000 };
    if (filterShiftId) params.shift_id = filterShiftId;
    if (filterExamDate) params.exam_date = parseDDMMYYYYToISO(filterExamDate);
    if (filterClassification) params.classification = filterClassification;
    if (filterRegion) params.region = filterRegion;
    Object.assign(params, extraFilterParams());
    if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
    // Which classification feeds the download: the run shown (picked or the day's newest); for a date
    // whose shift has no run, the newest earlier run of that day (previous shift); none -> scheduled
    // cameras without status.
    let run = selectedRunKey ? (classificationRuns.find((r) => runKey(r) === selectedRunKey) || null) : null;
    let fallback = false;
    if (!run && filterIso) {
      run = classificationRuns.find((r) => runDay(r) === filterIso) || null;
      fallback = true;
    }
    if (!run && filterIso) params.raw = '1';
    if (run) { params.run_start = run.started_at; params.run_end = run.ended_at; if (run.shift_id != null) params.run_shift_id = run.shift_id; }
    const res = await camerasAPI.getByExam(selectedExamId, params);
    let rows = res.data.data || [];
    const hls = (res.data.linkType === 'HLS') || isHLS;

    return { rows, hls, run, fallback };
  };

  /* One "Cameras" worksheet in the table's columns; Not Accessible sheets drop Classification + View. */
  const mapCameraRows = (rows, hls, dropClassView) => {
    // Full, openable frame URL (same domain convention as the detections export).
    const toAbsFrame = (fp) => {
      const rel = buildFrameImageUrl(fp);
      if (!rel) return '';
      return /^https?:/i.test(rel)
        ? rel
        : `http://www.examscctvmonitoring.com${rel.startsWith('/') ? '' : '/'}${rel}`;
    };


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
          ? (shifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
          : 'All shifts',
        ...(dropClassView ? {} : { 'View': toAbsFrame(cam.frame_path) }),
      }));
      viewCol = dropClassView ? -1 : 11;
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
      viewCol = dropClassView ? -1 : 10;
      cols = dropClassView
        ? [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 16 }, { wch: 60 }]
        : [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 12 }, { wch: 60 }];
    }

    return { sheetRows, viewCol, cols };
  };

  const makeCameraSheet = (rows, hls, dropClassView) => {
    const { sheetRows, viewCol, cols } = mapCameraRows(rows, hls, dropClassView);
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    ws['!cols'] = cols;

    // "View" column → short clickable "View" link to the frame URL (when present).
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

    return ws;
  };

  /* ── Download cameras sheet by status ──
     statusKey: 'accessible' | 'notAccessible' | 'total'
     Fetches ALL cameras for the exam (respecting the active shift/date scope,
     not search), filters by status, and builds an Excel mirroring the table's
     columns. The "View" column is a clickable link to the camera's frame. */
  const downloadStatusSheet = async (statusKey) => {
    if (!selectedExamId) return;
    try {
      let { rows, hls, run: usedRun } = await fetchScopeCameras();

      if (statusKey === 'accessible') {
        rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'accessible');
      } else if (statusKey === 'notAccessible') {
        rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'not accessible');
      }
      if (rows.length === 0) return;

      // Not Accessible cameras have no classification and no captured frame,
      // so drop the Classification and View columns from that sheet.
      const ws = makeCameraSheet(rows, hls, statusKey === 'notAccessible');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cameras');
      const label = statusKey === 'accessible' ? 'Accessible'
        : statusKey === 'notAccessible' ? 'Not_Accessible' : 'All';
      const examName = (selectedExamData?.exam_name || 'exam').replace(/[^\w]+/g, '_');

      // Only append a timestamp when a specific classification run is selected;
      // otherwise keep the original filename format unchanged.
      let fileStamp = '';
      if (usedRun) {
        try { fileStamp = '_' + format(new Date(usedRun.started_at), 'ddMMMyyyy_HHmmss'); }
        catch { fileStamp = ''; }
      }

      XLSX.writeFile(wb, `${examName}_${label}_cameras${fileStamp}.xlsx`);
    } catch (e) {
      console.error('Camera status download failed:', e);
    }
  };

  /* ── Camera Summary (admin) ──
     One workbook for the selected classification run (or the live status when none is picked):
     Summary (run, totals, per-centre counts, labels), Accessible, Not Accessible and All Cameras —
     the same columns as the single-status downloads. */
  const [summaryBusy, setSummaryBusy] = useState(false);
  const downloadCameraSummary = async () => {
    if (!selectedExamId || summaryBusy) return;
    setSummaryBusy(true);
    try {
      const { rows, hls, run, fallback } = await fetchScopeCameras();
      if (rows.length === 0) return;
      const isAcc = (c) => String(c.status || '').toLowerCase() === 'accessible';
      const isNot = (c) => String(c.status || '').toLowerCase() === 'not accessible';
      const acc = rows.filter(isAcc);
      const notAcc = rows.filter(isNot);
      const unknown = rows.length - acc.length - notAcc.length;

      const fmt = (v, f) => { try { return format(new Date(v), f); } catch { return '-'; } };
      const shiftId = run?.shift_id || filterShiftId;
      const shiftName = shiftId ? (shifts.find((x) => String(x.id) === String(shiftId))?.shift_name || `#${shiftId}`) : 'All shifts';
      const dateLabel = filterExamDate || (run ? fmt(run.started_at, 'dd-MM-yyyy') : '-');
      const fmtRun = (x) => { try { return format(new Date(x.started_at), 'dd MMM yyyy, HH:mm'); } catch { return '-'; } };
      const note = !fallback ? '' : run
        ? `No classification ran in this shift - status from the previous classification (${run.shift_name ? `${run.shift_name}, ` : ''}${fmtRun(run)}).`
        : 'No classification ran on this date - cameras listed without status.';

      // Styled workbook (ExcelJS, loaded only now): dashboard Summary + coloured Accessible / Not Accessible / All Cameras
      const [{ default: ExcelJSMod }, { buildCameraSummaryWorkbook, saveWorkbook }] = await Promise.all([
        import('exceljs'),
        import('../utils/cameraSummaryWorkbook'),
      ]);
      const ExcelJS = ExcelJSMod || (await import('exceljs'));
      const wb = buildCameraSummaryWorkbook(ExcelJS, {
        examName: selectedExamData ? `${selectedExamData.exam_name} (${selectedExamData.exam_body})` : 'Exam',
        accent: hls ? 'FF3C81F6' : 'FF384B91',
        shiftName, dateLabel, note, isHls: hls,
        accessibleRows: mapCameraRows(acc, hls, false).sheetRows,
        notAccessibleRows: mapCameraRows(notAcc, hls, true).sheetRows,
        allRows: mapCameraRows(rows, hls, false).sheetRows,
      });

      const examName = (selectedExamData?.exam_name || 'exam').replace(/[^\w]+/g, '_');
      const stamp = run ? fmt(run.started_at, 'ddMMMyyyy_HHmm') : (filterExamDate || '').replace(/-/g, '');
      const shiftTok = shiftId ? `_${shiftName.replace(/[^\w]+/g, '')}` : '';
      await saveWorkbook(wb, `${examName}_Camera_Summary${shiftTok}${stamp ? `_${stamp}` : ''}.xlsx`);
    } catch (e) {
      console.error('Camera summary download failed:', e);
    } finally {
      setSummaryBusy(false);
    }
  };

  /* ── Sorting logic ── */
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
    setPage(0);
  };

  /* ── Create / Edit ── */
  const handleOpenDialog = (camera = null) => {
    if (camera) {
      setEditingCamera(camera);
      setFormData(isHLS
        ? {
          centre_name: camera.centre_name || '', tc_code: camera.tc_code || '',
          city: camera.city || '', state: camera.state || '',
          camera_name: camera.camera_name || '', ch_code: camera.ch_code || '',
          cctv_url: camera.cctv_url || '', camera_category: camera.camera_category || '',
          classification: camera.classification || '',
          exam_date: formatDateDDMMYYYY(camera.exam_date || ''), shift_id: camera.shift_id || ''
        }
        : {
          device_id: camera.device_id || '', tc_code: camera.tc_code || '',
          camera_name: camera.camera_name || '', city: camera.city || '',
          centre_name: camera.centre_name || camera.tc_name || '',
          state: camera.state || '', region: camera.region || '', cctv_url: camera.cctv_url || camera.url || '',
          classification: camera.classification || ''
        });
    } else {
      setEditingCamera(null);
      setFormData(isHLS ? { ...HLS_EMPTY } : { ...RTSP_EMPTY });
    }
    setFormError('');
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    if (!selectedExamId) { setFormError('Select an exam first'); return; }
    if (!isHLS) {
      if (!formData.device_id?.trim()) { setFormError('Device ID is required'); return; }
      if (!formData.camera_name?.trim()) { setFormError('Camera Name is required'); return; }
      if (!formData.cctv_url?.trim()) { setFormError('CCTV URL is required'); return; }
    }
    const submissionData = isHLS ? { ...formData, exam_date: parseDDMMYYYYToISO(formData.exam_date) } : formData;
    try {
      if (editingCamera) { await camerasAPI.update(editingCamera.id, submissionData, selectedExamId); }
      else { await camerasAPI.create(selectedExamId, submissionData); }
      setOpenDialog(false);
      loadCameras();
    } catch (e) { setFormError(e.response?.data?.message || 'Operation failed'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this camera?')) return;
    try { await camerasAPI.delete(id, selectedExamId); loadCameras(); }
    catch { alert('Failed to delete'); }
  };


  const handleUpload = async () => {
    if (!uploadFile || !selectedExamId) { setUploadError('Select a file'); return; }
    setUploading(true); setUploadError('');
    try {
      const res = await camerasAPI.uploadExcel(selectedExamId, uploadFile, {
        shiftId: uploadShiftId || undefined,
        examDate: uploadDate ? parseDDMMYYYYToISO(uploadDate) : undefined,
      });
      setUploadResult(res.data);
      setOpenUpload(false); setUploadFile(null); setUploadShiftId(''); setUploadDate('');
      loadCameras();
    } catch (e) { setUploadError(e.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  const handleCloseUploadDialog = () => {
    setOpenUpload(false);
    setUploadFile(null);
    setUploadShiftId('');
    setUploadDate('');
    setUploadError('');
  };

  const handleDownloadTemplate = async (type) => {
    if (!selectedExamId) return;
    try { await camerasAPI.downloadTemplate(selectedExamId, type); }
    catch { alert('Download failed'); }
  };

  /* Load distinct classification values for the verify-dropdown whenever the
     exam changes (or when a verify completes — that may introduce a new value).
     The backend already returns these sorted + deduped. We fall back to deriving
     from the in-memory cameras list if the endpoint isn't reachable yet. */
  const loadClassOptions = useCallback(async () => {
    if (!selectedExamId) { setClassOptions([]); return; }
    try {
      const res = await camerasAPI.getClassifications(selectedExamId);
      setClassOptions(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch {
      const local = Array.from(new Set(
        (cameras || []).map((c) => c.classification).filter((v) => v && String(v).trim())
      )).sort();
      setClassOptions(local);
    }
  }, [selectedExamId, cameras]);

  useEffect(() => { loadClassOptions(); }, [loadClassOptions]);

  /* Load distinct region values (RTSP only — empty for HLS exams) whenever the
     exam changes. Mirrors loadClassOptions. */
  const loadRegionOptions = useCallback(async () => {
    if (!selectedExamId) { setRegionOptions([]); return; }
    try {
      const res = await camerasAPI.getRegions(selectedExamId);
      setRegionOptions(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch {
      const local = Array.from(new Set(
        (cameras || []).map((c) => c.region).filter((v) => v && String(v).trim())
      )).sort();
      setRegionOptions(local);
    }
  }, [selectedExamId, cameras]);

  useEffect(() => { loadRegionOptions(); }, [loadRegionOptions]);

  /* Reset verify-dialog state whenever the preview camera changes. */
  useEffect(() => {
    setVerifyError('');
    setVerifyChoice(previewCamera?.classification || '');
  }, [previewCamera]);

  const handleVerify = async () => {
    if (!previewCamera || !selectedExamId) return;
    const value = String(verifyChoice || '').trim();
    if (!value) { setVerifyError('Pick a classification'); return; }
    setVerifying(true); setVerifyError('');
    try {
      const res = await camerasAPI.verifyClassification(selectedExamId, previewCamera.id, value);
      const updated = res?.data?.data;
      // Patch the in-memory row so the table reflects the change immediately.
      setCameras((rows) => rows.map((c) => (c.id === previewCamera.id ? { ...c, ...updated } : c)));
      setPreviewCamera((c) => (c ? { ...c, ...updated } : c));
      // The new classification may not have existed before — refresh dropdown.
      loadClassOptions();
    } catch (e) {
      setVerifyError(e.response?.data?.message || 'Verify failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', overflow: 'hidden', bgcolor: '#f8fafc' }}>

        {/* ════ EXAM SIDEBAR ════ */}
        <ExamSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          exams={exams}
          selectedExamId={selectedExamId}
          onSelectExam={setSelectedExamId}
          viewingArchived={viewingArchived}
          onToggleArchived={() => {
            setViewingArchived(!viewingArchived);
            setSelectedExamId('');
          }}
        />

        {/* ════ RIGHT PANEL ════ */}
        <Box sx={{ flex: 1, p: { xs: 1.5, sm: 2.5, md: 3.5 }, overflowY: 'auto', minWidth: 0 }}>

          {!selectedExamId ? (
            /* Empty state */
            <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 200px)', textAlign: 'center', px: 4 }}>
              <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
                <CameraAltIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to view cameras</Typography>
              <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>
                Choose an exam from the sidebar to manage CCTV camera links.
              </Typography>
            </Box>
          ) : (
            <>
              {/* ── Title row ── */}
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'center' }, mb: 2, flexWrap: { xs: 'wrap', md: 'nowrap' }, gap: 2 }}>
                <Box sx={{ minWidth: 0, flex: { md: '1 1 0' } }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'nowrap', minWidth: 0 }}>
                    <Tooltip title={selectedExamData ? `${selectedExamData.exam_name} (${selectedExamData.exam_body})` : ''} arrow placement="bottom-start">
                      <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.5rem' }, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {selectedExamData ? `${selectedExamData.exam_name} (${selectedExamData.exam_body})` : 'Cameras'}
                      </Typography>
                    </Tooltip>
                    {selectedExamData && (
                      <Chip
                        label={examLinkType || selectedExamData.link_type}
                        size="small"
                        sx={{
                          flexShrink: 0, fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px',
                          bgcolor: isHLS ? 'primary.main' : '#a4b5fe', color: isHLS ? '#fff' : '#384b91'
                        }}
                      />
                    )}
                    {selectedExamData?.is_active === false && (
                      <Chip label="Archived" size="small" color="error" sx={{ flexShrink: 0, fontWeight: 600, height: 24, fontSize: '0.7rem' }} />
                    )}
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                      {totalCount} camera{totalCount !== 1 ? 's' : ''} • {isHLS ? 'HLS streams' : 'RTSP streams'}
                    </Typography>
                    {visionSummary?.started_at && (() => {
                      const today = new Date().toISOString().slice(0, 10);
                      const startedToday = visionSummary.started_at.startsWith(today);
                      const workersActive = startedToday && (visionSummary.duration_minutes ?? 0) < 600;
                      const durMins = visionSummary.duration_minutes;
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
                              {format(new Date(visionSummary.started_at), 'dd MMM, HH:mm')}
                            </Box>
                            {durStr && (
                              <Box component="span">
                                {' '}·{' '}
                                <Box component="span" sx={{ fontWeight: 600, color: workersActive ? '#d97706' : '#0369a1' }}>
                                  Time : {durStr}
                                </Box>
                              </Box>
                            )}
                            {(() => {
                              // Live ETA to complete vision across all workers — TIME ONLY
                              // (percent / processed-count intentionally not shown).
                              const p = visionSummary.progress;
                              if (!p || p.percent == null || p.percent >= 100) return null;
                              const fmt = (s) => {
                                if (s == null) return null;
                                const m = Math.round(s / 60);
                                return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
                              };
                              const etaStr = p.eta_seconds == null
                                ? null
                                : p.eta_seconds <= 30 ? 'finishing…' : `~${fmt(p.eta_seconds)} left`;
                              if (!etaStr) return null;
                              return (
                                <Box component="span">
                                  {' '}·{' '}
                                  <Box component="span" sx={{ fontWeight: 600, color: '#0369a1' }}>
                                    {etaStr}
                                  </Box>
                                </Box>
                              );
                            })()}
                          </Typography>
                        </>
                      );
                    })()}
                  </Box>
                </Box>

                {/* Far-right: Upload / Download Cameras / template menu */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap', flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                  <Button variant="outlined" startIcon={<CloudUpload />}
                    onClick={() => { setOpenUpload(true); setUploadError(''); setUploadFile(null); setUploadShiftId(''); setUploadDate(''); }}
                    sx={{ height: 40, flex: { xs: '1 1 auto', sm: '0 0 auto' }, textTransform: 'none', fontWeight: 600, borderRadius: 2, borderColor: tc.border, color: tc.text, '&:hover': { bgcolor: tc.soft, borderColor: tc.border } }}>
                    Upload Excel
                  </Button>
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
                    {user?.role === 'ADMIN' && (
                      <DlItem icon={<TableChart sx={{ fontSize: 20 }} />} color={tc.text} bg={tc.soft}
                        title={summaryBusy ? 'Preparing…' : 'Camera Summary'} sub="Summary + all status sheets in one file"
                        disabled={summaryBusy} onClick={() => { setDlAnchor(null); downloadCameraSummary(); }} />
                    )}
                    {user?.role === 'ADMIN' && <Divider sx={{ my: 0.5, mx: 1.5 }} />}
                    <DlItem icon={<CheckCircleIcon sx={{ fontSize: 20 }} />} color={tc.text} bg={tc.soft}
                      title="Accessible" sub="Reachable in the last check" count={statusCounts.accessible}
                      disabled={!statusCounts.accessible} onClick={() => { setDlAnchor(null); downloadStatusSheet('accessible'); }} />
                    <DlItem icon={<ErrorOutlineIcon sx={{ fontSize: 20 }} />} color="#dc2626" bg="#fef2f2"
                      title="Not Accessible" sub="Cameras that could not be reached" count={statusCounts.notAccessible}
                      disabled={!statusCounts.notAccessible} onClick={() => { setDlAnchor(null); downloadStatusSheet('notAccessible'); }} />
                    <DlItem icon={<VideocamIcon sx={{ fontSize: 20 }} />} color="#16a34a" bg="#f0fdf4"
                      title="Total" sub={statusCounts.unknown > 0 ? `Incl. ${statusCounts.unknown.toLocaleString()} not checked yet` : "Every camera in this view"} count={statusCounts.accessible + statusCounts.notAccessible + statusCounts.unknown}
                      disabled={!(statusCounts.accessible + statusCounts.notAccessible + statusCounts.unknown)} onClick={() => { setDlAnchor(null); downloadStatusSheet('total'); }} />
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

              {/* ── Filters row ── */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', mb: 2 }}>
                  {/* Search */}
                  <TextField
                    size="small"
                    placeholder="Search camera (1000700_12), centre, TC code, name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    InputProps={{
                      startAdornment: (
                        <InputAdornment position="start">
                          <Search sx={{ fontSize: 18, color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                      endAdornment: searchQuery !== debouncedSearchQuery && (
                        <InputAdornment position="end">
                          <CircularProgress size={16} sx={{ color: '#94a3b8' }} />
                        </InputAdornment>
                      ),
                      sx: {
                        borderRadius: '8px',
                        bgcolor: '#f8fafc',
                        height: 40,
                        fontSize: 14,
                        '& fieldset': { border: '1px solid #e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1 !important' },
                        '& input': { color: '#334155', '&::placeholder': { color: '#94a3b8', opacity: 1 } }
                      }
                    }}
                    sx={{ flex: { xs: '1 1 100%', sm: '1 1 260px' }, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', sm: 420 } }}
                  />

                  {/* Classification run picker — how many times classification has run;
                      selecting one scopes the table to that run's results.
                      Kept permanently mounted (visibility toggled via `display`,
                      not conditional rendering) — MUI's outlined-label notch width
                      is measured via a ResizeObserver that can miscalculate (border
                      line cutting through the label) if the control only mounts
                      once real data arrives; staying mounted from the start avoids
                      that timing glitch. */}
                  <FormControl
                    size="small"
                    sx={{
                      minWidth: { xs: 0, sm: 190 },
                      flex: { xs: '1 1 100%', sm: '0 0 auto' },
                      display: classificationRuns.length > 0 && !noExamDay ? 'flex' : 'none',
                    }}
                  >
                    <InputLabel id="cam-run-label" sx={{ fontSize: '0.85rem' }}>Classification Run</InputLabel>
                    <Select
                      labelId="cam-run-label"
                      value={selectedRunKey}
                      label="Classification Run"
                      onChange={(e) => { userPickedRun.current = true; setSelectedRunKey(e.target.value); setPage(0); }}
                      sx={{
                        borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9',
                        height: 40,
                        '& fieldset': { border: '1px solid #e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1 !important' },
                      }}
                    >
                      <MenuItem value="">{filterExamDate ? 'No classification (scheduled cameras)' : 'Latest (live)'}</MenuItem>
                      {runsForDay.map((r) => (
                        <MenuItem key={runKey(r)} value={runKey(r)}>
                          {r.shift_name ? `${r.shift_name} · ` : ''}{format(new Date(r.started_at), 'dd MMM, HH:mm')} · {r.total_cameras ?? r.camera_count} cameras
                          {r.total_cameras != null && ` (${r.camera_count} classified)`}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {/* Date, then shift. HLS: the camera rows of that date/shift. RTSP: pick a date first; the
                      shift filter then appears and limits the list to the centres scheduled in that date +
                      shift (uses the exam's centre schedule). */}
                  {(
                    <>
                      {/* Native date input — same style as Detections.jsx */}
                      <Box sx={{ position: 'relative', minWidth: { xs: 0, sm: 150 }, flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' } }}>
                        <TextField
                          type="date"
                          size="small"
                          value={filterExamDate ? filterExamDate.split('-').reverse().join('-') : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              // typed dates outside the exam period are ignored (the picker already greys them out)
                              if ((examStartIso && val < examStartIso) || (examEndIso && val > examEndIso)) return;
                              const [y, m, d] = val.split('-');
                              setFilterExamDate(`${d}-${m}-${y}`);
                            } else {
                              setFilterExamDate('');
                              if (!isHLS) setFilterShiftId('');   // RTSP: no date, no shift
                            }
                            setPage(0);
                          }}
                          InputProps={{
                            sx: {
                              borderRadius: '8px',
                              bgcolor: '#f1f5f9',
                              height: 40,
                              fontSize: 14,
                              color: filterExamDate ? 'transparent' : '#94a3b8',
                              paddingRight: '6px',
                              '& fieldset': { border: '1px solid #e2e8f0' },
                              '&:hover fieldset': { borderColor: '#cbd5e1' },
                              '&::-webkit-calendar-picker-indicator': {
                                cursor: 'pointer', opacity: 0.6,
                                '&:hover': { opacity: 1 },
                              },
                              // the formatted date is drawn by the overlay below: hide the browser's own text
                              // when a date is set (otherwise its year field ghosts through)
                              '& input::-webkit-datetime-edit': { opacity: filterExamDate ? 0 : 1 },
                            },
                          }}
                          inputProps={{ min: examStartIso || undefined, max: examEndIso || undefined }}
                          sx={{ width: '100%' }}
                        />
                        {filterExamDate && (
                          <Box sx={{
                            position: 'absolute', left: 14, top: '50%',
                            transform: 'translateY(-50%)', fontSize: 14,
                            color: '#334155', pointerEvents: 'none',
                          }}>
                            {filterExamDate}
                          </Box>
                        )}
                      </Box>

                      {/* RTSP: the shift filter appears only after a date is chosen */}
                      {(isHLS || filterExamDate) && (
                        <>
                      <Tooltip arrow disableHoverListener={isHLS}
                        title="Only the cameras of the centres scheduled on this date and shift (from the exam's centre schedule)">
                      <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 140 }, flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' } }}>
                        <InputLabel id="cam-shift-label" sx={{ fontSize: '0.85rem' }}>Shift</InputLabel>
                        <Select
                          labelId="cam-shift-label"
                          value={filterShiftId}
                          label="Shift"
                          onChange={(e) => { setFilterShiftId(e.target.value); setPage(0); }}
                          sx={{
                            borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9',
                            height: 40,
                            '& fieldset': { border: '1px solid #e2e8f0' },
                            '&:hover fieldset': { borderColor: '#cbd5e1 !important' },
                          }}
                        >
                          <MenuItem value="">All shifts</MenuItem>
                          {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                        </Select>
                      </FormControl>
                      </Tooltip>
                        </>
                      )}
                    </>
                  )}

                  {/* Advanced filter — icon only, right after the Shift filter; opens the panel below */}
                  <Tooltip title="Advanced filter">
                    <IconButton
                      onClick={(e) => setAdvAnchor(e.currentTarget)}
                      sx={{
                        position: 'relative', width: 40, height: 40, borderRadius: 2, color: '#334155',
                        border: '1px solid', borderColor: advancedFilterCount > 0 ? tc.border : '#e2e8f0',
                        bgcolor: advancedFilterCount > 0 ? tc.soft : '#f1f5f9',
                        '&:hover': { bgcolor: '#e2e8f0' },
                      }}
                    >
                      <TuneIcon sx={{ fontSize: 20 }} />
                      {advancedFilterCount > 0 && (
                        <Box component="span" sx={{
                          position: 'absolute', top: -6, right: -6, minWidth: 18, height: 18, px: 0.5, borderRadius: '9px',
                          bgcolor: tc.solid, color: tc.onSolid, fontSize: 11, fontWeight: 700,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        }}>{advancedFilterCount}</Box>
                      )}
                    </IconButton>
                  </Tooltip>
                  {activeFilterCount > 0 && (
                    <Button
                      size="small"
                      color="inherit"
                      onClick={clearAllFilters}
                      sx={{ height: 40, borderRadius: 2, textTransform: 'none', fontSize: '0.85rem', color: '#64748b', px: 1 }}
                    >
                      Clear
                    </Button>
                  )}
                  {(() => {
                    const fieldSx = {
                      '& .MuiInputBase-root': { borderRadius: 2, fontSize: '0.84rem', bgcolor: '#f8fafc', minHeight: 38 },
                      '& .MuiInputLabel-root': { fontSize: '0.875rem' },
                    };
                    const body = (
                      <Box sx={{ p: { xs: 1.5, sm: 2 }, width: { xs: '100%', sm: 440 }, maxWidth: '100%', boxSizing: 'border-box' }}>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                          <TextField select size="small" fullWidth label="Region" value={filterRegion} sx={fieldSx}
                            disabled={regionOptions.length === 0}
                            helperText={regionOptions.length === 0 ? 'No region data for this exam' : undefined}
                            onChange={(e) => { setFilterRegion(e.target.value); setPage(0); }}>
                            <MenuItem value="">All regions</MenuItem>
                            {regionOptions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                          </TextField>

                          <TextField select size="small" fullWidth label="Status" value={filterStatus} sx={fieldSx}
                            onChange={(e) => { setFilterStatus(e.target.value); setPage(0); }}>
                            <MenuItem value="">All statuses</MenuItem>
                            <MenuItem value="accessible">Accessible ({statusCounts.accessible})</MenuItem>
                            <MenuItem value="not_accessible">Not accessible ({statusCounts.notAccessible})</MenuItem>
                            {statusCounts.unknown > 0 && <MenuItem value="unknown">Unknown ({statusCounts.unknown})</MenuItem>}
                          </TextField>

                          <TextField select size="small" fullWidth label="Verification" value={filterVerified} sx={fieldSx}
                            onChange={(e) => { setFilterVerified(e.target.value); setPage(0); }}>
                            <MenuItem value="">All</MenuItem>
                            <MenuItem value="yes">Verified{facets?.verified ? ` (${facets.verified.yes})` : ''}</MenuItem>
                            <MenuItem value="no">Not verified{facets?.verified ? ` (${facets.verified.no})` : ''}</MenuItem>
                          </TextField>

                          <TextField select size="small" fullWidth label="Classification (type)" value={filterClasses} sx={fieldSx}
                            SelectProps={{
                              multiple: true,
                              renderValue: (sel) => (sel.length ? sel.map((v) => (v === '__unclassified__' ? 'Unclassified' : v)).join(', ') : ''),
                              MenuProps: { PaperProps: { sx: { maxHeight: 360 } } },
                            }}
                            onChange={(e) => { const v = e.target.value; setFilterClasses(typeof v === 'string' ? v.split(',') : v); setPage(0); }}>
                            {(facets?.classifications || []).map((c) => (
                              <MenuItem key={c.value} value={c.value} dense>
                                <Checkbox size="small" checked={filterClasses.includes(c.value)} sx={{ p: 0.5, mr: 1 }} />
                                <ListItemText
                                  primary={c.label}
                                  secondary={`${c.count} cameras · ${c.count - c.verified} not verified`}
                                  primaryTypographyProps={{ fontSize: '0.85rem' }}
                                  secondaryTypographyProps={{ fontSize: '0.72rem' }}
                                />
                              </MenuItem>
                            ))}
                          </TextField>

                          <Autocomplete
                            multiple
                            size="small"
                            disableCloseOnSelect
                            options={facets?.centres || []}
                            value={filterCentres}
                            onChange={(_, v) => { setFilterCentres(v); setPage(0); }}
                            isOptionEqualToValue={(o, v) => o.value === v.value}
                            getOptionLabel={(o) => o.label}
                            renderOption={(props, o) => (
                              <li {...props} key={o.value} style={{ fontSize: '0.82rem' }}>
                                <Box sx={{ flex: 1 }}>{o.label}</Box>
                                <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{o.count}</Typography>
                              </li>
                            )}
                            renderInput={(params) => <TextField {...params} label="TC code / centre" sx={fieldSx} />}
                            sx={{ gridColumn: { xs: 'auto', sm: '1 / -1' } }}
                          />
                        </Box>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1.25 }}>
                          <Button size="small" color="inherit" startIcon={<FilterAltOffIcon sx={{ fontSize: 18 }} />}
                            disabled={advancedFilterCount === 0}
                            onClick={() => { setFilterRegion(''); setFilterStatus(''); setFilterVerified(''); setFilterClasses([]); setFilterCentres([]); setPage(0); }}
                            sx={{ textTransform: 'none', color: '#475569' }}>
                            Reset
                          </Button>
                          <Button variant="contained" size="small" onClick={() => setAdvAnchor(null)} sx={{ textTransform: 'none', borderRadius: 2, px: 3, boxShadow: 'none' }}>
                            Done
                          </Button>
                        </Box>
                      </Box>
                    );
                    return isSmDown ? (
                      <Dialog open={Boolean(advAnchor)} onClose={() => setAdvAnchor(null)} fullScreen>
                        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontWeight: 700 }}>
                          Advanced filter
                          <IconButton onClick={() => setAdvAnchor(null)} size="small"><CloseIcon /></IconButton>
                        </DialogTitle>
                        <DialogContent dividers sx={{ p: 0 }}>{body}</DialogContent>
                      </Dialog>
                    ) : (
                      <Popover
                        open={Boolean(advAnchor)}
                        anchorEl={advAnchor}
                        onClose={() => setAdvAnchor(null)}
                        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
                        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
                        PaperProps={{ sx: { borderRadius: 3, mt: 1, boxShadow: '0 12px 32px rgba(15,23,42,0.18)' } }}
                      >
                        <Box sx={{ px: 2, pt: 1.5, pb: 0, fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>Advanced filter</Box>
                        {body}
                      </Popover>
                    );
                  })()}


                  {/* Active advanced filters, removable — own row under the toolbar */}
                  {advancedFilterCount > 0 && (
                    <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, width: '100%', justifyContent: { md: 'flex-end' } }}>
                      {filterRegion && <Chip size="small" variant="outlined" label={`Region: ${filterRegion}`} onDelete={() => { setFilterRegion(''); setPage(0); }} />}
                      {filterStatus && <Chip size="small" variant="outlined" label={`Status: ${{ accessible: 'Accessible', not_accessible: 'Not accessible', unknown: 'Unknown' }[filterStatus] || filterStatus}`} onDelete={() => { setFilterStatus(''); setPage(0); }} />}
                      {filterVerified && <Chip size="small" variant="outlined" label={filterVerified === 'yes' ? 'Verified' : 'Not verified'} onDelete={() => { setFilterVerified(''); setPage(0); }} />}
                      {filterClasses.map((c) => (
                        <Chip key={`cl-${c}`} size="small" variant="outlined" label={c === '__unclassified__' ? 'Type: Unclassified' : `Type: ${c}`}
                          onDelete={() => { setFilterClasses((p) => p.filter((x) => x !== c)); setPage(0); }} />
                      ))}
                      {filterCentres.map((c) => (
                        <Chip key={`tc-${c.value}`} size="small" variant="outlined" label={`TC: ${c.label}`}
                          onDelete={() => { setFilterCentres((p) => p.filter((x) => x.value !== c.value)); setPage(0); }} />
                      ))}
                    </Box>
                  )}

              </Box>

              {/* ── Info row: schedule note (left) + not-accessible cameras per DV (right, RTSP only; HLS shows just the schedule note) ── */}
              {(() => {
                const needShift = filterExamDate && !filterShiftId && !selectedRunKey;
                const fmtDay = (d) => { try { return format(new Date(d), 'dd MMM yyyy'); } catch { return d; } };
                let left = null, leftTip = '', leftSeverity = 'info';
                if (filterShiftId && !filterExamDate && !selectedRunKey) {
                left = 'Pick a date to see the total centres scheduled in this shift';
                leftTip = 'Total centres is shown for a date + shift. Choose an exam date as well.';
              } else if (needShift && dayInfo?.scheduled && dayInfo.runs) {
                  left = `Total centres: ${dayInfo.centres} (${fmtDay(dayInfo.date)}, all shifts)`;
                  leftTip = `${dayInfo.cameras} cameras of the ${dayInfo.centres} centres scheduled on ${dayInfo.date} in any shift. Pick a shift to narrow the list.`;
              } else if (needShift) {
                  left = 'Pick a shift to see only the centres scheduled on this date';
                  leftTip = 'Choose a shift to limit the list to the centres scheduled on this date and shift.';
                } else if (scheduleInfo) {
                  if (!scheduleInfo.applied) {
                    left = 'No schedule uploaded - every camera is shown';
                    leftTip = 'This exam has no schedule uploaded (Exams → Edit), so every camera is shown.';
                  } else if (!scheduleInfo.exam_runs) {
                    left = `Exam does not run on ${fmtDay(scheduleInfo.date)} in this shift`; leftSeverity = 'warning';
                    leftTip = `The exam does not run on ${scheduleInfo.date} in this shift (exam date & shift schedule) — no cameras are scheduled.`;
                  } else if (scheduleInfo.centres != null) {
                    left = `Total centres: ${scheduleInfo.centres} (${fmtDay(scheduleInfo.date)})`;
                    leftTip = `Showing only the cameras of the ${scheduleInfo.centres} centres scheduled on ${scheduleInfo.date} in this shift${selectedRunKey ? ' (plus any camera this run recorded)' : ''}. Other centres are not scheduled and are not checked or classified then.`;
                  } else {
                    left = 'Every centre runs on this date and shift'; leftTip = left;
                  }
                }
                const nDv = serverStats?.servers?.length || 0;
                const nNot = serverStats?.totalNotAccessible || 0;
                const allOk = nNot === 0 && statusCounts.accessible > 0 && statusCounts.notAccessible === 0 && statusCounts.unknown === 0;
                const unchecked = nNot === 0 && !allOk && (statusCounts.accessible + statusCounts.notAccessible + statusCounts.unknown) > 0;
                const showRight = !noExamDay && (noRunForDay || (!isHLS && (nNot > 0 || allOk || unchecked)));
                if (noExamDay) return null;            // the "no exam on this day" panel below says it all
                if (!left && !showRight) return null;
                return (
                  <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', alignItems: 'stretch' }}>
                    {left && (
                      <Box sx={{ flex: '1 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderRadius: 2,
                        bgcolor: leftSeverity === 'warning' ? '#fffbeb' : '#eff6ff', color: leftSeverity === 'warning' ? '#92400e' : '#1e3a8a' }}>
                        <Tooltip title={leftTip} arrow placement="bottom-start">
                          <InfoOutlinedIcon sx={{ fontSize: 22, color: leftSeverity === 'warning' ? '#d97706' : '#2563eb', cursor: 'help' }} />
                        </Tooltip>
                        <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>{left}</Typography>
                      </Box>
                    )}
                    {showRight && (
                    <Box sx={{ flex: '1 1 260px', minWidth: 0, display: 'flex', alignItems: 'center', gap: 1.25, px: 2, py: 1.25, borderRadius: 2,
                      bgcolor: noRunForDay ? '#fffbeb' : nNot > 0 ? '#fef2f2' : allOk ? '#f0fdf4' : '#f8fafc', color: noRunForDay ? '#92400e' : nNot > 0 ? '#7f1d1d' : allOk ? '#14532d' : '#475569' }}>
                      {noRunForDay ? (
                        <>
                          <InfoOutlinedIcon sx={{ fontSize: 22, color: '#d97706' }} />
                          <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
                            No classification ran on {fmtDay(filterIso)}{filterShiftId ? ' in this shift' : ''} - showing the scheduled cameras without status
                          </Typography>
                        </>
                      ) : nNot > 0 ? (
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
                          <Typography sx={{ fontSize: '0.92rem', fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>Accessibility not checked yet{statusCounts.unknown ? ` - ${statusCounts.unknown.toLocaleString()} camera${statusCounts.unknown !== 1 ? 's' : ''} unchecked` : ''}</Typography>
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
                  {(serverStats?.servers || []).map((sv) => {
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
                  {(!serverStats?.servers || serverStats.servers.length === 0) && (
                    <Typography sx={{ color: '#64748b', fontSize: '0.9rem' }}>No non-accessible cameras in this view.</Typography>
                  )}
                </Box>
              </Drawer>

              {/* Upload result alert */}
              {uploadResult && (
                <Alert 
                  severity={uploadResult.message.includes('Skipped') ? 'warning' : 'success'} 
                  sx={{ mb: 2 }} 
                  onClose={() => setUploadResult(null)}
                >
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {uploadResult.message}
                  </Typography>
                  {uploadResult.message.includes('Skipped') && (
                    <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'inherit' }}>
                      Duplicate detection based on: {isHLS 
                        ? 'TC Code + Ch Code' 
                        : 'Device ID + Camera No + TC Code'}
                    </Typography>
                  )}
                </Alert>
              )}

              {/* ── Table ── */}
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
              ) : noExamDay ? (
                <Box sx={{ textAlign: 'center', py: 8, px: 2, border: '1px dashed #cbd5e1', borderRadius: 3, bgcolor: '#f8fafc' }}>
                  <EventBusyIcon sx={{ fontSize: 48, color: '#94a3b8', mb: 1 }} />
                  <Typography sx={{ fontWeight: 700, color: '#334155', fontSize: '1.05rem' }}>
                    No exam cameras are scheduled on {(() => { try { return format(new Date(filterIso), 'dd MMM yyyy'); } catch { return filterExamDate; } })()}{filterShiftId ? ' in this shift' : ''}
                  </Typography>
                  <Typography sx={{ color: '#64748b', mt: 0.5, fontSize: '0.9rem' }}>
                    Choose another date{filterShiftId ? ' or shift' : ''} to see the cameras and their classification.
                  </Typography>
                </Box>
              ) : cameras.length > 0 ? (
                <>
                  <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none', maxWidth: '100%', overflowX: 'auto' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          {isHLS ? (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 180 }}>
                                <TableSortLabel
                                  active={orderBy === 'centre_name'}
                                  direction={orderBy === 'centre_name' ? order : 'asc'}
                                  onClick={() => handleRequestSort('centre_name')}
                                >
                                  Centre Name
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>
                                <TableSortLabel
                                  active={orderBy === 'tc_code'}
                                  direction={orderBy === 'tc_code' ? order : 'asc'}
                                  onClick={() => handleRequestSort('tc_code')}
                                >
                                  TC Code
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'state'}
                                  direction={orderBy === 'state' ? order : 'asc'}
                                  onClick={() => handleRequestSort('state')}
                                >
                                  State
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 150 }}>
                                <TableSortLabel
                                  active={orderBy === 'camera_name'}
                                  direction={orderBy === 'camera_name' ? order : 'asc'}
                                  onClick={() => handleRequestSort('camera_name')}
                                >
                                  Camera / Lab
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>
                                <TableSortLabel
                                  active={orderBy === 'ch_code'}
                                  direction={orderBy === 'ch_code' ? order : 'asc'}
                                  onClick={() => handleRequestSort('ch_code')}
                                >
                                  Ch Code
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'camera_category'}
                                  direction={orderBy === 'camera_category' ? order : 'asc'}
                                  onClick={() => handleRequestSort('camera_category')}
                                >
                                  Category
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'classification'}
                                  direction={orderBy === 'classification' ? order : 'asc'}
                                  onClick={() => handleRequestSort('classification')}
                                >
                                  Classification
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 130 }}>
                                <TableSortLabel
                                  active={orderBy === 'status'}
                                  direction={orderBy === 'status' ? order : 'asc'}
                                  onClick={() => handleRequestSort('status')}
                                >
                                  Status
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 110 }}>
                                <TableSortLabel
                                  active={orderBy === 'exam_date'}
                                  direction={orderBy === 'exam_date' ? order : 'asc'}
                                  onClick={() => handleRequestSort('exam_date')}
                                >
                                  Exam Date
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>
                                <TableSortLabel
                                  active={orderBy === 'shift_name'}
                                  direction={orderBy === 'shift_name' ? order : 'asc'}
                                  onClick={() => handleRequestSort('shift_name')}
                                >
                                  Shift
                                </TableSortLabel>
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 70 }}>
                                View
                              </TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'device_id'}
                                  direction={orderBy === 'device_id' ? order : 'asc'}
                                  onClick={() => handleRequestSort('device_id')}
                                >
                                  Device ID
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>
                                <TableSortLabel
                                  active={orderBy === 'camera_no'}
                                  direction={orderBy === 'camera_no' ? order : 'asc'}
                                  onClick={() => handleRequestSort('camera_no')}
                                >
                                  Camera No
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>
                                <TableSortLabel
                                  active={orderBy === 'tc_code'}
                                  direction={orderBy === 'tc_code' ? order : 'asc'}
                                  onClick={() => handleRequestSort('tc_code')}
                                >
                                  TC Code
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 150 }}>
                                <TableSortLabel
                                  active={orderBy === 'camera_name'}
                                  direction={orderBy === 'camera_name' ? order : 'asc'}
                                  onClick={() => handleRequestSort('camera_name')}
                                >
                                  Camera Name
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 180 }}>
                                <TableSortLabel
                                  active={orderBy === 'centre_name'}
                                  direction={orderBy === 'centre_name' ? order : 'asc'}
                                  onClick={() => handleRequestSort('centre_name')}
                                >
                                  Centre Name
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'state'}
                                  direction={orderBy === 'state' ? order : 'asc'}
                                  onClick={() => handleRequestSort('state')}
                                >
                                  State
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>
                                <TableSortLabel
                                  active={orderBy === 'region'}
                                  direction={orderBy === 'region' ? order : 'asc'}
                                  onClick={() => handleRequestSort('region')}
                                >
                                  Region
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'classification'}
                                  direction={orderBy === 'classification' ? order : 'asc'}
                                  onClick={() => handleRequestSort('classification')}
                                >
                                  Classification
                                </TableSortLabel>
                              </TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 130 }}>
                                <TableSortLabel
                                  active={orderBy === 'status'}
                                  direction={orderBy === 'status' ? order : 'asc'}
                                  onClick={() => handleRequestSort('status')}
                                >
                                  Status
                                </TableSortLabel>
                              </TableCell>
                              <TableCell align="center" sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 70 }}>
                                View
                              </TableCell>
                            </>
                          )}
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 250 }}>CCTV URL</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {cameras.map((cam) => (
                          <TableRow key={cam.id} hover sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                            {isHLS ? (
                              <>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{cam.centre_name || '-'}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{cam.tc_code || '-'}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{cam.state || '-'}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{cam.camera_name || '-'}</TableCell>
                                <TableCell>
                                  {cam.ch_code ? <Chip label={cam.ch_code} size="small" variant="outlined" /> : '-'}
                                </TableCell>
                                <TableCell>
                                  <Chip label={cam.camera_category || 'N/A'} size="small" />
                                </TableCell>
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
                                  {cam.shift_id
                                    ? (shifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
                                    : <Chip label="All shifts" size="small" color="default" variant="outlined" />}
                                </TableCell>
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
                              </>
                            )}
                            <TableCell sx={{ maxWidth: 250 }}>
                              <Tooltip title={cam.cctv_url || cam.url}>
                                <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all', fontSize: '0.75rem' }}>
                                  {truncate(cam.cctv_url || cam.url, 45)}
                                </Typography>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                  <TablePagination
                    component="div" count={totalCount} page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    rowsPerPageOptions={[15, 25, 50, 100, 200, 500]}
                    sx={{
                      '.MuiTablePagination-toolbar': { pl: { xs: 0, sm: 2 }, flexWrap: 'wrap' },
                      '.MuiTablePagination-selectLabel': { display: { xs: 'none', sm: 'block' } },
                    }}
                  />
                </>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e8ecf1' }}>
                  <Typography sx={{ fontSize: '0.95rem', color: '#64748b' }}>
                    No cameras found. Upload an Excel or add manually.
                  </Typography>
                </Box>
              )}
            </>
          )}
        </Box>


        {/* ── Upload Dialog ── */}
        <Dialog open={openUpload} onClose={handleCloseUploadDialog} maxWidth="sm" fullWidth
          PaperProps={{ sx: { overflow: 'visible', minHeight: 380 } }}
          sx={{ '& .MuiDialog-container': { alignItems: 'flex-start', pt: { xs: 2, sm: 10 } } }}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudUpload /> Upload Camera Links Excel
          </DialogTitle>
          <DialogContent sx={{ overflow: 'visible' }}>
            {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}
            <Alert severity="info" sx={{ mb: 2 }}>
              {isHLS
                ? 'Expected HLS columns: TC Code, Centre Name, City, State, Camera Name, ch_no, CCTV URL, Camera Category, Classification (optional)'
                : 'Expected RTSP columns: Device ID, TC Code, Camera Name, Centre Name, City, State, Region, Server Address, Classification (or Scene Classification / Room Classification - optional)'}
              <br /><strong>Download the template below to get the exact format.</strong>
              <br />
              <Typography variant="caption" sx={{ mt: 1, display: 'block', color: '#0288d1' }}>
                <strong>Duplicate Detection:</strong> {isHLS 
                  ? 'Cameras with same TC Code + Ch Code will be skipped.' 
                  : 'Cameras with same Device ID + Camera No + TC Code will be skipped.'}
              </Typography>
            </Alert>
            <Button variant="outlined" component="label" fullWidth startIcon={<Upload />} sx={{ mb: 2 }}>
              {uploadFile ? uploadFile.name : 'Choose Excel File (.xlsx / .xls)'}
              <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => { setUploadFile(e.target.files[0]); setUploadError(''); }} />
            </Button>
            {isHLS && (
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, mt: 1 }}>
                <TextField select fullWidth label="Shift (optional)" value={uploadShiftId}
                  onChange={(e) => setUploadShiftId(e.target.value)} size="medium"
                  InputLabelProps={{ shrink: true }}
                  SelectProps={{
                    displayEmpty: true, renderValue: (value) => {
                      if (!value) return 'All shifts';
                      return shifts.find((s) => String(s.id) === String(value))?.shift_name || `#${value}`;
                    }
                  }}>
                  <MenuItem value="">All shifts</MenuItem>
                  {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                </TextField>
                <DatePicker
                  label="Exam Date (optional)"
                  value={parseDDMMYYYYToDate(uploadDate)}
                  onChange={(date) => setUploadDate(formatDateDDMMYYYY(date))}
                  inputFormat="dd-MM-yyyy"
                  renderInput={(params) => <TextField {...params} fullWidth size="small" />}
                />
              </Box>
            )}
          </DialogContent>
          <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
            <Box display="flex" gap={1}>
              <Tooltip title="Download HLS Template">
                <Button variant="outlined" size="small" startIcon={<Download />}
                  onClick={() => handleDownloadTemplate('hls')}
                  sx={{ borderColor: 'primary.main', color: 'primary.main', '&:hover': { bgcolor: '#ecfeff' }, textTransform: 'none', fontWeight: 600 }}>
                  HLS
                </Button>
              </Tooltip>
              <Tooltip title="Download RTSP Template">
                <Button variant="outlined" size="small" startIcon={<Download />}
                  onClick={() => handleDownloadTemplate('rtsp')}
                  sx={{ borderColor: 'buttonrtsp.bg', color: 'buttonrtsp.text', '&:hover': { bgcolor: '#f5f3ff' }, textTransform: 'none', fontWeight: 600 }}>
                  RTSP
                </Button>
              </Tooltip>
            </Box>
            <Box display="flex" gap={1}>
              <Button onClick={handleCloseUploadDialog}>Cancel</Button>
              <Button variant="contained" onClick={handleUpload} disabled={!uploadFile || uploading}
                startIcon={uploading ? <CircularProgress size={16} /> : <CloudUpload />}>
                {uploading ? 'Uploading…' : 'Upload'}
              </Button>
            </Box>
          </DialogActions>
        </Dialog>

        {/* ── Frame preview Dialog ── */}
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
                {previewCamera?.camera_category && (
                  <Chip
                    label={`Category: ${previewCamera.camera_category}`}
                    size="small"
                    sx={{ fontWeight: 600, fontSize: '0.7rem' }}
                  />
                )}
                {previewCamera?.centre_name && (
                  <Typography sx={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {previewCamera.centre_name}
                  </Typography>
                )}
              </Box>
            </Box>
          </DialogTitle>
          <DialogContent dividers sx={{ bgcolor: '#f8fafc', p: 2 }}>
            {previewCamera && (
              previewError || !buildFrameImageUrl(previewCamera.frame_path) ? (
                <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', py: 6, color: '#94a3b8' }}>
                  <ImageNotSupportedIcon sx={{ fontSize: 48, mb: 1.5 }} />
                  <Typography sx={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    Image not available
                  </Typography>
                  <Typography sx={{ fontSize: '0.78rem', mt: 0.5 }}>
                    The captured frame could not be loaded.
                  </Typography>
                  {previewCamera.frame_path && (
                    <Typography sx={{ fontSize: '0.7rem', mt: 1.5, fontFamily: 'monospace', wordBreak: 'break-all', maxWidth: 520, textAlign: 'center', color: '#cbd5e1' }}>
                      {previewCamera.frame_path}
                    </Typography>
                  )}
                </Box>
              ) : (
                <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                  <Box
                    component="img"
                    src={buildFrameImageUrl(previewCamera.frame_path)}
                    alt={previewCamera.camera_name || 'frame'}
                    onError={() => setPreviewError(true)}
                    sx={{
                      maxWidth: '100%',
                      maxHeight: { xs: '60vh', sm: '70vh' },
                      borderRadius: 1.5,
                      boxShadow: '0 2px 12px rgba(15,23,42,0.12)',
                      bgcolor: '#000',
                    }}
                  />
                </Box>
              )
            )}
          </DialogContent>
          <DialogActions sx={{ flexDirection: { xs: 'column-reverse', sm: 'row' }, flexWrap: 'wrap', gap: 1, justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' }, px: 2, py: 1.5 }}>
            {/* Operator-only inline verify control */}
            {isVerifier ? (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', flex: 1, minWidth: { xs: '100%', sm: 280 } }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel id="verify-classification-label">Classification</InputLabel>
                  <Select
                    labelId="verify-classification-label"
                    label="Classification"
                    value={verifyChoice}
                    onChange={(e) => setVerifyChoice(e.target.value)}
                    disabled={verifying}
                  >
                    {/* Always include the current value so it shows in the dropdown
                        even if it isn't in classOptions yet (e.g., first run). */}
                    {previewCamera?.classification && !classOptions.includes(previewCamera.classification) && (
                      <MenuItem value={previewCamera.classification}>{previewCamera.classification}</MenuItem>
                    )}
                    {classOptions.map((opt) => (
                      <MenuItem key={opt} value={opt}>{opt}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <Button
                  size="small"
                  variant="contained"
                  color="success"
                  startIcon={verifying ? <CircularProgress size={14} sx={{ color: '#fff' }} /> : <VerifiedRoundedIcon />}
                  onClick={handleVerify}
                  disabled={verifying || !verifyChoice}
                  sx={{ textTransform: 'none', fontWeight: 600 }}
                >
                  {previewCamera?.manually_verified ? 'Re-verify' : 'Verify'}
                </Button>
                {verifyError && (
                  <Typography sx={{ color: '#dc2626', fontSize: '0.75rem' }}>{verifyError}</Typography>
                )}
              </Box>
            ) : <Box sx={{ flex: 1 }} />}

            {/* Existing right-side actions */}
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {previewCamera?.frame_path && !previewError && (
                <Button
                  onClick={() => window.open(buildFrameImageUrl(previewCamera.frame_path), '_blank', 'noopener')}
                  size="small"
                >
                  Open in new tab
                </Button>
              )}
              <Button onClick={() => setPreviewCamera(null)} variant="contained" size="small">Close</Button>
            </Box>
          </DialogActions>
        </Dialog>

      </Box>
    </LocalizationProvider>
  );
};

export default Cameras;

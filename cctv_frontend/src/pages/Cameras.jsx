import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Chip,
  CircularProgress, Alert, Tooltip, Divider, Stack, TablePagination,
  FormControl, InputLabel, Select, InputAdornment, TableSortLabel,
  useMediaQuery, useTheme,
} from '@mui/material';
import {
  Add, Edit, Delete, Upload, CloudUpload, Download,
  TableChart, Search,
  Videocam as VideocamIcon,
  Visibility as VisibilityIcon,
  ImageNotSupported as ImageNotSupportedIcon,
  CheckCircle as CheckCircleIcon,
  VerifiedRounded as VerifiedRoundedIcon,
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

  /* ── Classification run picker ── */
  const [classificationRuns, setClassificationRuns] = useState([]);
  const [selectedRunKey, setSelectedRunKey] = useState(''); // runKey(run) = "<shift_id>|<started_at>", or '' = latest/live


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
    setSelectedRunKey('');
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setPage(0);
  }, [selectedExamId]);

  const loadClassificationRuns = useCallback(() => {
    if (!selectedExamId) return;
    camerasAPI.getClassificationRuns(selectedExamId)
      .then((res) => setClassificationRuns(Array.isArray(res?.data?.data) ? res.data.data : []))
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
  }, [page, rowsPerPage, filterShiftId, filterExamDate, filterClassification, filterRegion, selectedRunKey, debouncedSearchQuery, orderBy, order]);

  const loadCameras = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      const params = { is_active: true, page: page + 1, limit: rowsPerPage };
      if (filterShiftId) params.shift_id = filterShiftId;
      if (filterExamDate) params.exam_date = parseDDMMYYYYToISO(filterExamDate);
      if (filterClassification) params.classification = filterClassification;
      if (filterRegion) params.region = filterRegion;
      if (selectedRunKey) {
        const run = classificationRuns.find((r) => runKey(r) === selectedRunKey);
        if (run) { params.run_start = run.started_at; params.run_end = run.ended_at; if (run.shift_id != null) params.run_shift_id = run.shift_id; }
      }
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      if (orderBy) { params.sort_by = orderBy; params.sort_order = order; }
      const res = await camerasAPI.getByExam(selectedExamId, params);
      setCameras(res.data.data || []);
      setTotalCount(res.data.totalCount || (res.data.data || []).length);
      setExamLinkType(res.data.linkType);
      setScheduleInfo(res.data.schedule || null);
      setStatusCounts(res.data.statusCounts || { accessible: 0, notAccessible: 0, unknown: 0 });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedExamId, page, rowsPerPage, filterShiftId, filterExamDate, filterClassification, filterRegion, selectedRunKey, classificationRuns, debouncedSearchQuery, orderBy, order]);

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
  const isHLS = examLinkType === 'HLS' || selectedExamData?.link_type?.toUpperCase() === 'HLS';
  const shifts = selectedExamData?.examShifts || [];

  /* ── Download cameras sheet by status ──
     statusKey: 'accessible' | 'notAccessible' | 'total'
     Fetches ALL cameras for the exam (respecting the active shift/date scope,
     not search), filters by status, and builds an Excel mirroring the table's
     columns. The "View" column is a clickable link to the camera's frame. */
  const downloadStatusSheet = async (statusKey) => {
    if (!selectedExamId) return;
    try {
      const params = { is_active: true, page: 1, limit: 1000000 };
      if (filterShiftId) params.shift_id = filterShiftId;
      if (filterExamDate) params.exam_date = parseDDMMYYYYToISO(filterExamDate);
      if (filterClassification) params.classification = filterClassification;
      if (filterRegion) params.region = filterRegion;
      if (selectedRunKey) {
        const run = classificationRuns.find((r) => runKey(r) === selectedRunKey);
        if (run) { params.run_start = run.started_at; params.run_end = run.ended_at; if (run.shift_id != null) params.run_shift_id = run.shift_id; }
      }
      const res = await camerasAPI.getByExam(selectedExamId, params);
      let rows = res.data.data || [];
      const hls = (res.data.linkType === 'HLS') || isHLS;

      if (statusKey === 'accessible') {
        rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'accessible');
      } else if (statusKey === 'notAccessible') {
        rows = rows.filter((c) => String(c.status || '').toLowerCase() === 'not accessible');
      }
      if (rows.length === 0) return;

      // Full, openable frame URL (same domain convention as the detections export).
      const toAbsFrame = (fp) => {
        const rel = buildFrameImageUrl(fp);
        if (!rel) return '';
        return /^https?:/i.test(rel)
          ? rel
          : `http://www.examscctvmonitoring.com${rel.startsWith('/') ? '' : '/'}${rel}`;
      };

      // Not Accessible cameras have no classification and no captured frame,
      // so drop the Classification and View columns from that sheet.
      const dropClassView = statusKey === 'notAccessible';

      // Per-camera classification timestamp when a specific run is selected
      // (falls back to '-' for the live/latest view, or if this camera wasn't
      // part of the selected run).
      const runTimeLabel = (cam) => {
        if (!cam.classification_run_at) return '-';
        try { return format(new Date(cam.classification_run_at), 'dd MMM yyyy, HH:mm:ss'); }
        catch { return '-'; }
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
          'Classification Run': runTimeLabel(cam),
          'Status': cam.status || '-',
          'Exam Date': formatDateDDMMYYYY(cam.exam_date) || '-',
          'Shift': cam.shift_id
            ? (shifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
            : 'All shifts',
          ...(dropClassView ? {} : { 'View': toAbsFrame(cam.frame_path) }),
        }));
        viewCol = dropClassView ? -1 : 11;
        cols = dropClassView
          ? [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }]
          : [{ wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 22 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 14 }, { wch: 16 }, { wch: 60 }];
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
          'Classification Run': runTimeLabel(cam),
          'Status': cam.status || '-',
          ...(dropClassView ? {} : { 'View': toAbsFrame(cam.frame_path) }),
          'CCTV URL': cam.cctv_url || cam.url || '-',
        }));
        viewCol = dropClassView ? -1 : 10;
        cols = dropClassView
          ? [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 20 }, { wch: 16 }, { wch: 60 }]
          : [{ wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 22 }, { wch: 34 }, { wch: 16 }, { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 60 }];
      }

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

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Cameras');
      const label = statusKey === 'accessible' ? 'Accessible'
        : statusKey === 'notAccessible' ? 'Not_Accessible' : 'All';
      const examName = (selectedExamData?.exam_name || 'exam').replace(/[^\w]+/g, '_');

      // Only append a timestamp when a specific classification run is selected;
      // otherwise keep the original filename format unchanged.
      let fileStamp = '';
      if (selectedRunKey) {
        const run = classificationRuns.find((r) => runKey(r) === selectedRunKey);
        if (run) {
          try { fileStamp = '_' + format(new Date(run.started_at), 'ddMMMyyyy_HHmmss'); }
          catch { fileStamp = ''; }
        }
      }

      XLSX.writeFile(wb, `${examName}_${label}_cameras${fileStamp}.xlsx`);
    } catch (e) {
      console.error('Camera status download failed:', e);
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
              <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'stretch', md: 'flex-start' }, mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
                      {selectedExamData ? `${selectedExamData.exam_name} (${selectedExamData.exam_body})` : 'Cameras'}
                    </Typography>
                    {selectedExamData && (
                      <Chip
                        label={examLinkType || selectedExamData.link_type}
                        size="small"
                        sx={{
                          fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px',
                          bgcolor: isHLS ? 'primary.main' : '#a4b5fe', color: isHLS ? '#fff' : '#384b91'
                        }}
                      />
                    )}
                    {selectedExamData?.is_active === false && (
                      <Chip label="Archived" size="small" color="error" sx={{ fontWeight: 600, height: 24, fontSize: '0.7rem' }} />
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

                {/* Far-right: filters + action buttons */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                  {/* Search */}
                  <TextField
                    size="small"
                    placeholder="Search center, state..."
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
                    sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', sm: 300 } }}
                  />

                  {/* Classification filter — applies to both HLS and RTSP */}
                  {SHOW_CLASSIFICATION_FILTER && (
                    <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 160 }, flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' } }}>
                      <InputLabel id="cam-classification-label" sx={{ fontSize: '0.85rem' }}>Classification</InputLabel>
                      <Select
                        labelId="cam-classification-label"
                        value={filterClassification}
                        label="Classification"
                        onChange={(e) => { setFilterClassification(e.target.value); setPage(0); }}
                        sx={{
                          borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9',
                          height: 40,
                          '& fieldset': { border: '1px solid #e2e8f0' },
                          '&:hover fieldset': { borderColor: '#cbd5e1 !important' },
                        }}
                      >
                        <MenuItem value="">All classifications</MenuItem>
                        {classOptions.map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )}

                  {/* Region filter — RTSP cameras only; empty options list (HLS
                      exam, or exam with no region data) hides it entirely. */}
                  {regionOptions.length > 0 && (
                    <FormControl size="small" sx={{ minWidth: { xs: 0, sm: 140 }, flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' } }}>
                      <InputLabel id="cam-region-label" sx={{ fontSize: '0.85rem' }}>Region</InputLabel>
                      <Select
                        labelId="cam-region-label"
                        value={filterRegion}
                        label="Region"
                        onChange={(e) => { setFilterRegion(e.target.value); setPage(0); }}
                        sx={{
                          borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9',
                          height: 40,
                          '& fieldset': { border: '1px solid #e2e8f0' },
                          '&:hover fieldset': { borderColor: '#cbd5e1 !important' },
                        }}
                      >
                        <MenuItem value="">All regions</MenuItem>
                        {regionOptions.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                      </Select>
                    </FormControl>
                  )}

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
                      display: classificationRuns.length > 0 ? 'flex' : 'none',
                    }}
                  >
                    <InputLabel id="cam-run-label" sx={{ fontSize: '0.85rem' }}>Classification Run</InputLabel>
                    <Select
                      labelId="cam-run-label"
                      value={selectedRunKey}
                      label="Classification Run"
                      onChange={(e) => { setSelectedRunKey(e.target.value); setPage(0); }}
                      sx={{
                        borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9',
                        height: 40,
                        '& fieldset': { border: '1px solid #e2e8f0' },
                        '&:hover fieldset': { borderColor: '#cbd5e1 !important' },
                      }}
                    >
                      <MenuItem value="">Latest (live)</MenuItem>
                      {classificationRuns.map((r) => (
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

                  <Tooltip title="Download HLS Template">
                    <Button variant="outlined" size="small" startIcon={<Download />}
                      onClick={() => handleDownloadTemplate('hls')}
                      sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, borderColor: 'primary.main', color: 'primary.main', '&:hover': { bgcolor: '#ecfeff' }, textTransform: 'none', fontWeight: 600 }}>
                      HLS
                    </Button>
                  </Tooltip>
                  <Tooltip title="Download RTSP Template">
                    <Button variant="outlined" size="small" startIcon={<Download />}
                      onClick={() => handleDownloadTemplate('rtsp')}
                      sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, borderColor: 'buttonrtsp.bg', color: 'buttonrtsp.text', '&:hover': { bgcolor: '#f5f3ff' }, textTransform: 'none', fontWeight: 600 }}>
                      RTSP
                    </Button>
                  </Tooltip>

                  <Button variant="outlined" startIcon={<CloudUpload />}
                    onClick={() => { setOpenUpload(true); setUploadError(''); setUploadFile(null); setUploadShiftId(''); setUploadDate(''); }}
                    sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, textTransform: 'none', fontWeight: 600 }}>
                    Upload Excel
                  </Button>

                </Box>
              </Box>

              {!isHLS && filterExamDate && !filterShiftId && !selectedRunKey && (
                <Alert severity="info" sx={{ mb: 2 }}>Now pick a shift to see only the centres scheduled on this date.</Alert>
              )}
              {!isHLS && scheduleInfo && (
                <Alert severity={scheduleInfo.applied ? (scheduleInfo.exam_runs ? 'info' : 'warning') : 'info'} sx={{ mb: 2 }}>
                  {!scheduleInfo.applied
                    ? 'This exam has no schedule uploaded (Exams → Edit), so every camera is shown.'
                    : !scheduleInfo.exam_runs
                      ? `The exam does not run on ${scheduleInfo.date} in this shift (exam date & shift schedule) — no cameras are scheduled.`
                      : scheduleInfo.centres != null
                        ? `Showing only the cameras of the ${scheduleInfo.centres} centres scheduled on ${scheduleInfo.date} in this shift${selectedRunKey ? ' (plus any camera this run recorded)' : ''}. Other centres are not scheduled and are not checked or classified then.`
                        : 'Every centre runs on this date and shift.'}
                </Alert>
              )}

              {cameras.length > 0 && cameras.some(cam => cam.status !== null && cam.status !== undefined) && (
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>

                  <Box
                    onClick={() => downloadStatusSheet('accessible')}
                    title="Download Accessible cameras sheet"
                    sx={{
                    flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
                    height: 30,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    borderRadius: 2,
                    border: '1px solid #3c81f6',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: '#eff6ff', boxShadow: '0 1px 4px rgba(60,129,246,0.25)' },
                  }}>
                    <Download sx={{ fontSize: 14, color: 'primary.main' }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'primary.main', fontWeight: 600 }}>
                        Accessible
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'primary.main' }}>
                        {statusCounts.accessible}
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    onClick={() => downloadStatusSheet('notAccessible')}
                    title="Download Not Accessible cameras sheet"
                    sx={{
                    flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
                    height: 30,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    borderRadius: 2,
                    border: '1px solid #333',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: '#f3f4f6', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' },
                  }}>
                    <Download sx={{ fontSize: 14, color: '#777' }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#777', fontWeight: 600 }}>
                        Not Accessible
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#777' }}>
                        {statusCounts.notAccessible}
                      </Typography>
                    </Box>
                  </Box>

                  <Box
                    onClick={() => downloadStatusSheet('total')}
                    title="Download all cameras sheet"
                    sx={{
                    flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
                    height: 30,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    borderRadius: 2,
                    border: '1px solid #16a34a',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    '&:hover': { bgcolor: '#f0fdf4', boxShadow: '0 1px 4px rgba(22,163,74,0.25)' },
                  }}>
                    <Download sx={{ fontSize: 14, color: '#16a34a' }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#16a34a', fontWeight: 600 }}>
                        Total
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a' }}>
                        {statusCounts.accessible + statusCounts.notAccessible + statusCounts.unknown}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Unknown */}
                  {statusCounts.unknown > 0 && (
                    <Box sx={{
                      flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' },
                      px: 2,
                      height: 30,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 1.1,
                      borderRadius: 2,
                      border: '1px solid #e5e7eb',
                      bgcolor: '#f9fafb'
                    }}>
                      <Box sx={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        bgcolor: '#9ca3af'
                      }} />
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Typography sx={{ fontSize: '0.75rem', color: '#4b5563', fontWeight: 600 }}>
                          Unknown
                        </Typography>
                        <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#6b7280' }}>
                          {statusCounts.unknown}
                        </Typography>
                      </Box>
                    </Box>
                  )}

                </Box>
              )}

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

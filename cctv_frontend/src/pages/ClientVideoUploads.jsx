import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Chip,
  TextField,
  Button,
  IconButton,
  Tooltip,
  LinearProgress,
  CircularProgress,
  Autocomplete,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Collapse,
  Snackbar,
  Alert,
  InputAdornment,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  CloudUpload,
  UploadFile,
  VideoFile,
  FolderZip,
  Close,
  CheckCircle,
  ErrorOutline,
  ExpandMore,
  Search,
  Refresh,
  Movie,
  MeetingRoom,
  Storage as StorageIcon,
  WifiOff,
  Cancel,
  PhotoCamera,
  Image as ImageIcon,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { examsAPI, camerasAPI } from '../services/api';
import { uploadFiles, listTc, listExamTcs, getUploadStats, healthCheck } from '../services/videoUploadApi';
import ExamSidebar from '../components/ExamSidebar';

/*
 * ClientVideoUploads — exam-center media uploads.
 *
 * On disk (worker-6):  /localstorage/videos/<exam_name>/<tcCode>/<kind>/
 *   kind ∈ { video, live_image, uploaded_image }.
 *
 * Flow: pick exam → pick/type TC code → three SEPARATE uploaders (Videos, Live
 * Images, Uploaded Images), each with its own drop zone and a single BULK upload
 * (all staged files in one request). The "Uploaded" list is read from the server
 * (GET /exam/:exam and /exam/:exam/tc/:tcCode) so it's identical on any device.
 */

const NAME_CACHE_KEY = 'client_vu_names_v1';

const VIDEO_EXT = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.mpeg', '.mpg', '.ts', '.mts', '.m2ts', '.3gp', '.3g2', '.vob', '.ogv', '.mxf', '.dv'];
const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif'];
const TC_CODE_RE = /^[A-Za-z0-9_-]{1,80}$/;

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const isZip = (name = '') => name.toLowerCase().endsWith('.zip');
const matchExt = (name, list) => list.some((e) => (name || '').toLowerCase().endsWith(e));
const isVideoFile = (f) => (f.type && f.type.startsWith('video/')) || matchExt(f.name, VIDEO_EXT);
const isImageFile = (f) => (f.type && f.type.startsWith('image/')) || matchExt(f.name, IMAGE_EXT);

// Parent folder = the exam name, made filesystem-safe (matches the server's
// [A-Za-z0-9_-] segment rule). e.g. "UGC NET June 2026 (CDIS)" → "UGC_NET_June_2026_CDIS".
const slugify = (s) => String(s || '').trim().replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);

const KIND_ORDER = ['video', 'live_image', 'uploaded_image'];
const KIND_META = {
  video: {
    label: 'Videos', noun: 'video', icon: Movie, accept: `.zip,video/*,${VIDEO_EXT.join(',')}`,
    test: isVideoFile, color: '#2563eb', tint: '#eff6ff', chipBg: '#eaf3ff', chipFg: '#2563eb', chipBd: '#bfdbfe',
  },
  live_image: {
    label: 'Live Images', noun: 'image', icon: PhotoCamera, accept: `.zip,image/*,${IMAGE_EXT.join(',')}`,
    test: isImageFile, color: '#0891b2', tint: '#ecfeff', chipBg: '#cffafe', chipFg: '#0e7490', chipBd: '#a5f3fc',
  },
  uploaded_image: {
    label: 'Uploaded Images', noun: 'image', icon: ImageIcon, accept: `.zip,image/*,${IMAGE_EXT.join(',')}`,
    test: isImageFile, color: '#7c3aed', tint: '#f5f3ff', chipBg: '#ede9fe', chipFg: '#6d28d9', chipBd: '#ddd6fe',
  },
};

const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let val = bytes / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) { val /= 1024; i += 1; }
  return `${val.toFixed(val >= 10 ? 0 : 1)} ${units[i]}`;
};

const formatDateTime = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '-';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const loadNameCache = () => {
  try { return JSON.parse(localStorage.getItem(NAME_CACHE_KEY)) || {}; } catch { return {}; }
};

const emptyStaging = () => ({ video: [], live_image: [], uploaded_image: [] });

const ClientVideoUploads = () => {
  const theme = useTheme();
  const isSmDown = useMediaQuery(theme.breakpoints.down('sm'));
  const [searchParams] = useSearchParams();

  // ── Exam rail ──
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewingArchived, setViewingArchived] = useState(false);
  useEffect(() => { setSidebarOpen(!isSmDown); }, [isSmDown]);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(searchParams.get('exam') || '');

  // ── TC code picker ──
  const [centers, setCenters] = useState([]);
  const [centersLoading, setCentersLoading] = useState(false);
  const [selectedCenter, setSelectedCenter] = useState(null);
  const [tcInput, setTcInput] = useState('');
  const [centreName, setCentreName] = useState('');

  // ── Staging (per kind) + uploads ──
  const [activeKind, setActiveKind] = useState('video');
  const [staging, setStaging] = useState(emptyStaging);   // { kind: [{key,file,name,size,isZip}] }
  const [dragKind, setDragKind] = useState(null);
  const [tasks, setTasks] = useState([]);                 // bulk upload tasks
  const [serverFiles, setServerFiles] = useState({});     // tcCode -> { loading, error, kinds:{video:[],live_image:[],uploaded_image:[]} }
  const [examTcs, setExamTcs] = useState({ loading: false, error: null, list: [] });
  const [nameCacheAll, setNameCacheAll] = useState(loadNameCache);
  const [expanded, setExpanded] = useState({});
  const [search, setSearch] = useState('');
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'success' });
  const fileInputRef = useRef(null);
  const xhrRefs = useRef(new Map());

  // ── Service health + storage ──
  const [serviceOnline, setServiceOnline] = useState(null);
  const [storageStats, setStorageStats] = useState(null);

  const notify = (message, severity = 'success') => setSnack({ open: true, message, severity });

  const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));
  const examSlug = selectedExam ? slugify(selectedExam.exam_name) : '';
  const nameCache = nameCacheAll[examSlug] || {};

  // ── Load exams ──
  const loadExams = useCallback(async () => {
    try {
      const res = await examsAPI.getAll({ is_active: true });
      setExams(Array.isArray(res?.data?.data) ? res.data.data : []);
    } catch (e) { console.error(e); }
  }, []);
  useEffect(() => { loadExams(); }, [loadExams]);

  // ── Service health (mount + every 60 s) ──
  useEffect(() => {
    let cancelled = false;
    const check = async () => { const ok = await healthCheck(); if (!cancelled) setServiceOnline(ok); };
    check();
    const iv = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, []);

  const refreshStorage = useCallback(async () => {
    try { setStorageStats(await getUploadStats()); } catch { /* down */ }
  }, []);
  useEffect(() => { refreshStorage(); }, [refreshStorage]);

  // ── Server-side exam list (cross-device truth) ──
  const fetchExamList = useCallback(async (exam) => {
    if (!exam) { setExamTcs({ loading: false, error: null, list: [] }); return; }
    setExamTcs((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await listExamTcs(exam);
      setExamTcs({ loading: false, error: null, list: Array.isArray(data?.tc_codes) ? data.tc_codes : [] });
    } catch (e) {
      setExamTcs({ loading: false, error: e.message, list: [] });
    }
  }, []);

  // ── Files (per kind) for one TC code ──
  const fetchTc = useCallback(async (exam, code) => {
    if (!exam || !code) return;
    setServerFiles((prev) => ({ ...prev, [code]: { ...(prev[code] || {}), loading: true, error: null } }));
    try {
      const data = await listTc(exam, code);
      setServerFiles((prev) => ({ ...prev, [code]: { loading: false, error: null, kinds: data?.kinds || {} } }));
    } catch (e) {
      setServerFiles((prev) => ({ ...prev, [code]: { loading: false, error: e.message, kinds: prev[code]?.kinds || {} } }));
    }
  }, []);

  // cosmetic: remember a TC code's center name for display
  const rememberName = useCallback((exam, code, centre) => {
    if (!centre) return;
    setNameCacheAll((prev) => {
      const em = { ...(prev[exam] || {}) };
      if (em[code] === centre) return prev;
      em[code] = centre;
      const next = { ...prev, [exam]: em };
      try { localStorage.setItem(NAME_CACHE_KEY, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  }, []);

  // ── TC-code search ──
  const fetchCenters = useCallback(async (examId, query) => {
    if (!examId) { setCenters([]); setCentersLoading(false); return; }
    const q = (query || '').trim();
    setCentersLoading(true);
    try {
      const params = { is_active: true, page: 1, limit: 50 };
      if (q.length >= 2) params.search = q;
      const res = await camerasAPI.getByExam(examId, params);
      const rows = res?.data?.data || [];
      const map = new Map();
      rows.forEach((c) => {
        if (!c.tc_code) return;
        if (!map.has(c.tc_code)) map.set(c.tc_code, { tc_code: c.tc_code, centre_name: c.centre_name || c.tc_name || '', state: c.state || '', cameras: 0 });
        map.get(c.tc_code).cameras += 1;
      });
      setCenters(Array.from(map.values()).sort((a, b) => a.tc_code.localeCompare(b.tc_code)));
    } catch (e) { console.error('TC code fetch failed', e); setCenters([]); }
    finally { setCentersLoading(false); }
  }, []);

  const handleCentersOpen = useCallback(() => {
    if (selectedExamId && centers.length === 0 && !centersLoading) fetchCenters(selectedExamId, tcInput.trim());
  }, [selectedExamId, centers.length, centersLoading, tcInput, fetchCenters]);

  // Reset + load the exam's uploads when exam changes.
  useEffect(() => {
    setSelectedCenter(null); setTcInput(''); setCentreName('');
    setCenters([]); setStaging(emptyStaging()); setSearch(''); setServerFiles({}); setActiveKind('video');
    fetchExamList(examSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examSlug]);

  useEffect(() => {
    if (!selectedExamId) return undefined;
    const q = tcInput.trim();
    if (q.length < 2) return undefined;
    if (selectedCenter && selectedCenter.tc_code.toUpperCase() === q.toUpperCase()) { setCentersLoading(false); return undefined; }
    setCentersLoading(true);
    const timer = setTimeout(() => fetchCenters(selectedExamId, q), 350);
    return () => clearTimeout(timer);
  }, [tcInput, selectedExamId, selectedCenter, fetchCenters]);

  // Fetch the resolved TC code's files (for the "already uploaded" counts).
  useEffect(() => {
    const code = (selectedCenter?.tc_code || tcInput.trim().toUpperCase());
    if (!examSlug || !code || !TC_CODE_RE.test(code)) return undefined;
    const timer = setTimeout(() => fetchTc(examSlug, code), 400);
    return () => clearTimeout(timer);
  }, [selectedCenter, tcInput, examSlug, fetchTc]);

  /* ── Staging ── */
  const addFiles = useCallback((kind, fileList) => {
    const meta = KIND_META[kind];
    const incoming = Array.from(fileList || []);
    const accepted = [];
    const rejected = [];
    incoming.forEach((file) => {
      if (isZip(file.name) || meta.test(file)) {
        accepted.push({ key: `${file.name}-${file.size}-${file.lastModified}`, file, name: file.name, size: file.size, isZip: isZip(file.name) });
      } else {
        rejected.push(file.name);
      }
    });
    if (accepted.length) {
      setStaging((prev) => {
        const seen = new Set(prev[kind].map((p) => p.key));
        const merged = [...prev[kind]];
        accepted.forEach((a) => { if (!seen.has(a.key)) merged.push(a); });
        return { ...prev, [kind]: merged };
      });
    }
    if (rejected.length) notify(`Skipped ${rejected.length} file${rejected.length > 1 ? 's' : ''} — only ${meta.noun}s & .zip allowed here`, 'warning');
  }, []);

  const handleFileInput = (e) => { addFiles(activeKind, e.target.files); e.target.value = ''; };
  const handleDrop = (kind, e) => { e.preventDefault(); setDragKind(null); addFiles(kind, e.dataTransfer.files); };
  const removeStaged = (kind, key) => setStaging((prev) => ({ ...prev, [kind]: prev[kind].filter((p) => p.key !== key) }));
  const clearStaged = (kind) => setStaging((prev) => ({ ...prev, [kind]: [] }));

  /* ── Resolve target TC code ── */
  const resolveCenter = () => {
    if (selectedCenter) return selectedCenter;
    const code = tcInput.trim().toUpperCase();
    if (!code) return null;
    const match = centers.find((c) => c.tc_code.toUpperCase() === code);
    return match || { tc_code: code, centre_name: '', custom: true };
  };
  const resolvedCenter = resolveCenter();
  const isCustomTc = !!resolvedCenter?.custom;
  const resolvedCode = resolvedCenter?.tc_code || '';

  /* ── Bulk upload (one request per kind) ── */
  const runBulk = async (task, files) => {
    try {
      const result = await uploadFiles(task.exam, task.tcCode, task.kind, files, {
        onProgress: (pct) => setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, progress: pct } : t))),
        onXhr: (xhr) => xhrRefs.current.set(task.id, xhr),
      });
      const saved = result?.saved_count || 0;
      const skipped = result?.skipped_count || 0;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'done', progress: 100, savedCount: saved, skippedCount: skipped } : t)));
      if (skipped) notify(`${task.tcCode}: ${saved} saved, ${skipped} skipped (wrong type)`, skipped && !saved ? 'warning' : 'success');
      else notify(`${task.tcCode}: uploaded ${saved} ${KIND_META[task.kind].label.toLowerCase()}`, 'success');
      rememberName(task.exam, task.tcCode, task.centreName);
      refreshStorage();
      fetchExamList(task.exam);
      fetchTc(task.exam, task.tcCode);
      setExpanded((prev) => ({ ...prev, [task.tcCode]: true }));
    } catch (err) {
      if (err.aborted) {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'cancelled' } : t)));
        notify('Upload cancelled', 'info');
      } else {
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: 'error', errorMsg: err.message } : t)));
        notify(`Upload failed: ${err.message}`, 'error');
      }
      // reflect any partial writes
      fetchExamList(task.exam);
      fetchTc(task.exam, task.tcCode);
    } finally {
      xhrRefs.current.delete(task.id);
      setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== task.id)), 5000);
    }
  };

  const handleStartUpload = (kind) => {
    const center = resolveCenter();
    if (!center) { notify('Select or type a TC code first', 'warning'); return; }
    if (!TC_CODE_RE.test(center.tc_code)) { notify('Invalid TC code — letters, digits, - or _ only.', 'warning'); return; }
    if (!examSlug) { notify('No exam selected', 'warning'); return; }
    const items = staging[kind];
    if (!items.length) { notify(`Add ${KIND_META[kind].noun}s to upload`, 'warning'); return; }
    const task = {
      id: uid(),
      exam: examSlug,
      examName: selectedExam?.exam_name || '',
      tcCode: center.tc_code,
      centreName: centreName.trim() || center.centre_name || '',
      kind,
      total: items.length,
      progress: 0,
      status: 'uploading',
      startedAt: new Date().toISOString(),
    };
    setTasks((prev) => [task, ...prev]);
    runBulk(task, items.map((i) => i.file));
    notify(`Uploading ${items.length} ${KIND_META[kind].noun}${items.length > 1 ? 's' : ''} to ${task.tcCode}`, 'info');
    clearStaged(kind);
  };

  const cancelTask = (taskId) => {
    const xhr = xhrRefs.current.get(taskId);
    if (xhr) xhr.abort();
    xhrRefs.current.delete(taskId);
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status: 'cancelled' } : t)));
    setTimeout(() => setTasks((prev) => prev.filter((t) => t.id !== taskId)), 4000);
  };

  /* ── Derived ── */
  const resolvedServer = (resolvedCode && serverFiles[resolvedCode]) || {};
  const resolvedKinds = resolvedServer.kinds || {};

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (examTcs.list || [])
      .map((t) => ({
        code: t.tcCode,
        centreName: nameCache[t.tcCode] || '',
        kinds: t.kinds || {},
        total: t.total_count || 0,
        latest: KIND_ORDER.reduce((m, k) => {
          const lm = t.kinds?.[k]?.latest_modified;
          return lm && lm > m ? lm : m;
        }, ''),
      }))
      .filter((g) => {
        if (!q) return true;
        if (g.code.toLowerCase().includes(q) || (g.centreName || '').toLowerCase().includes(q)) return true;
        const files = serverFiles[g.code]?.kinds || {};
        return KIND_ORDER.some((k) => (files[k] || []).some((f) => (f.name || '').toLowerCase().includes(q)));
      })
      .sort((a, b) => String(b.latest).localeCompare(String(a.latest)));
  }, [examTcs.list, serverFiles, nameCache, search]);

  const totalCenters = (examTcs.list || []).length;
  const totalFiles = (examTcs.list || []).reduce((s, t) => s + (t.total_count || 0), 0);

  const refreshAll = () => { fetchExamList(examSlug); setServerFiles({}); };
  const openGroup = (code) => {
    setExpanded((prev) => {
      const willOpen = !(prev[code] ?? false);
      if (willOpen && !serverFiles[code]) fetchTc(examSlug, code);
      return { ...prev, [code]: willOpen };
    });
  };

  const activeTasks = tasks.filter((t) => t.status === 'uploading');

  /* ── Small render helpers ── */
  const KindChips = ({ kinds, size = 'sm' }) => (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
      {KIND_ORDER.map((k) => {
        const n = kinds?.[k]?.count || 0;
        if (!n) return null;
        const m = KIND_META[k];
        const Icon = m.icon;
        return (
          <Chip
            key={k}
            icon={<Icon sx={{ fontSize: '14px !important', color: `${m.chipFg} !important` }} />}
            label={n}
            size="small"
            sx={{ height: size === 'sm' ? 20 : 22, fontSize: '0.68rem', fontWeight: 700, bgcolor: m.chipBg, color: m.chipFg, border: `1px solid ${m.chipBd}`, '& .MuiChip-label': { px: 0.75 } }}
          />
        );
      })}
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', height: 'calc(100vh - 120px)', bgcolor: '#f8fafc', borderRadius: 2, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <ExamSidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        exams={exams}
        selectedExamId={selectedExamId}
        onSelectExam={(id) => setSelectedExamId(id)}
        viewingArchived={viewingArchived}
        onToggleArchived={() => { setViewingArchived((v) => !v); setSelectedExamId(''); }}
      />

      <Box sx={{ flex: 1, p: { xs: 1.5, sm: 3 }, overflowY: 'auto', minWidth: 0 }}>
        {!selectedExamId ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center' }}>
            <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
              <Movie sx={{ fontSize: 40, color: '#3b82f6' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to upload media</Typography>
            <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 440, lineHeight: 1.6 }}>
              Choose an exam from the sidebar, then pick a TC code to upload its videos and images.
            </Typography>
          </Box>
        ) : (
          <>
            {/* ── Header ── */}
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, alignItems: 'flex-start', justifyContent: 'space-between', mb: 2.5 }}>
              <Box sx={{ minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5, flexWrap: 'wrap' }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
                    {selectedExam ? `${selectedExam.exam_name} (${selectedExam.exam_body})` : 'Media Uploads'}
                  </Typography>
                  {selectedExam && <Chip label={selectedExam.link_type} size="small" sx={{ fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px', bgcolor: '#a4b5fe', color: '#384b91' }} />}
                </Box>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                  Videos, live images & uploaded images — per TC code
                  {totalFiles > 0 && ` · ${totalFiles} file${totalFiles !== 1 ? 's' : ''} across ${totalCenters} TC code${totalCenters !== 1 ? 's' : ''}`}
                </Typography>
              </Box>
              {/* service + storage status */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                {serviceOnline === false && (
                  <Chip icon={<WifiOff sx={{ fontSize: '14px !important', color: '#dc2626 !important' }} />} label="Service offline" size="small" sx={{ fontWeight: 600, fontSize: '0.7rem', bgcolor: '#fef2f2', color: '#dc2626' }} />
                )}
                {storageStats?.disk && (
                  <Tooltip title={`${formatBytes(storageStats.disk.free_gb * 1e9)} free of ${formatBytes(storageStats.disk.total_gb * 1e9)}`}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.5, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e8ecf1' }}>
                      <StorageIcon sx={{ fontSize: 16, color: '#64748b' }} />
                      <Box sx={{ width: 60, height: 6, borderRadius: 3, bgcolor: '#eef2f7', overflow: 'hidden' }}>
                        <Box sx={{ width: `${Math.min(storageStats.disk.used_pct || 0, 100)}%`, height: '100%', borderRadius: 3, bgcolor: (storageStats.disk.used_pct || 0) > 90 ? '#dc2626' : (storageStats.disk.used_pct || 0) > 75 ? '#f59e0b' : '#16a34a' }} />
                      </Box>
                      <Typography sx={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600 }}>{storageStats.disk.used_pct}%</Typography>
                    </Box>
                  </Tooltip>
                )}
              </Box>
            </Box>

            {/* ── Upload media + Uploaded media, side by side on large screens ── */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', lg: 'row' }, alignItems: 'flex-start', gap: { xs: 3, lg: 2.5 } }}>
              {/* Left column: the uploader (+ live progress). Sticks in place on
                  large screens so files being uploaded stay visible while the
                  list on the right scrolls. */}
              <Box sx={{ width: { xs: '100%', lg: 460 }, flexShrink: 0, position: { lg: 'sticky' }, top: 0, alignSelf: { lg: 'flex-start' } }}>

            {/* ── Upload card ── */}
            <Paper sx={{ p: { xs: 2, sm: 3 }, mb: 3, borderRadius: 3, border: '1px solid #e8ecf1', boxShadow: '0 6px 18px rgba(15, 23, 42, 0.05)' }}>
              <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1rem', mb: 2 }}>Upload media</Typography>

              {/* TC code picker */}
              <Box sx={{ mb: 2.5, maxWidth: 520 }}>
                <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', mb: 0.75 }}>
                  TC Code <Box component="span" sx={{ color: '#ef4444' }}>*</Box>
                </Typography>
                <Autocomplete
                  freeSolo autoSelect selectOnFocus handleHomeEndKeys
                  options={centers}
                  value={selectedCenter}
                  inputValue={tcInput}
                  onOpen={handleCentersOpen}
                  onInputChange={(e, val) => setTcInput(val)}
                  onChange={(e, v) => {
                    if (!v) { setSelectedCenter(null); return; }
                    if (typeof v === 'string') {
                      const code = v.trim().toUpperCase();
                      const match = centers.find((c) => c.tc_code.toUpperCase() === code);
                      if (match) { setSelectedCenter(match); setCentreName(match.centre_name || ''); }
                      else { setSelectedCenter(null); setTcInput(code); }
                    } else { setSelectedCenter(v); setCentreName(v.centre_name || ''); }
                  }}
                  loading={centersLoading}
                  isOptionEqualToValue={(o, v) => o.tc_code === v.tc_code}
                  getOptionLabel={(o) => (typeof o === 'string' ? o : (o?.tc_code || ''))}
                  filterOptions={(opts) => opts}
                  loadingText="Loading TC codes…"
                  noOptionsText="No matching TC code — press Enter to use it as a new one"
                  renderOption={(props, option) => (
                    <Box component="li" {...props} key={option.tc_code} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1 }}>
                      <MeetingRoom sx={{ fontSize: 18, color: '#94a3b8', flexShrink: 0 }} />
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a' }}>{option.tc_code}</Typography>
                        {option.centre_name && (
                          <Typography sx={{ fontSize: '0.76rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {option.centre_name}{option.state ? ` · ${option.state}` : ''}
                          </Typography>
                        )}
                      </Box>
                      <Chip label={`${option.cameras} cam`} size="small" sx={{ height: 18, fontSize: '0.65rem', bgcolor: '#f1f5f9', color: '#64748b' }} />
                    </Box>
                  )}
                  renderInput={(params) => (
                    <TextField
                      {...params} size="small" placeholder="Search TC code or center name, or type a new one…"
                      InputProps={{
                        ...params.InputProps,
                        startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>,
                        endAdornment: (<>{centersLoading ? <CircularProgress size={16} sx={{ color: '#94a3b8', mr: 3.5 }} /> : null}{params.InputProps.endAdornment}</>),
                        sx: { borderRadius: '10px', bgcolor: '#f8fafc', fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } },
                      }}
                    />
                  )}
                />
                {resolvedCenter && (
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.75, flexWrap: 'wrap' }}>
                    <Typography sx={{ fontSize: '0.78rem', color: '#2563eb', fontWeight: 500 }}>
                      Uploading to {resolvedCenter.tc_code}{(centreName.trim() || resolvedCenter.centre_name) ? ` — ${centreName.trim() || resolvedCenter.centre_name}` : ''}
                    </Typography>
                    {isCustomTc && <Chip label="New TC code" size="small" sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700, bgcolor: '#fef3c7', color: '#b45309' }} />}
                  </Box>
                )}
              </Box>

              {isCustomTc && (
                <Box sx={{ mb: 2.5, maxWidth: 520 }}>
                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569', mb: 0.75 }}>
                    Center name <Box component="span" sx={{ color: '#94a3b8', fontWeight: 500 }}>(optional)</Box>
                  </Typography>
                  <TextField size="small" fullWidth placeholder="Enter center name" value={centreName} onChange={(e) => setCentreName(e.target.value)}
                    InputProps={{ sx: { borderRadius: '10px', bgcolor: '#f8fafc', fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } } }} />
                </Box>
              )}

              {/* Kind selector (three separate uploaders) */}
              <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {KIND_ORDER.map((k) => {
                  const m = KIND_META[k];
                  const Icon = m.icon;
                  const isActive = activeKind === k;
                  const stagedN = staging[k].length;
                  const storedN = resolvedKinds[k]?.length || 0;
                  return (
                    <Box
                      key={k}
                      onClick={() => setActiveKind(k)}
                      role="button"
                      sx={{
                        flex: { xs: '1 1 100%', sm: '1 1 0' }, minWidth: { sm: 150 },
                        display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.25, cursor: 'pointer',
                        borderRadius: 2.5, border: '1.5px solid', transition: 'all 0.15s ease',
                        borderColor: isActive ? m.color : '#e8ecf1',
                        bgcolor: isActive ? m.tint : '#fff',
                        '&:hover': { borderColor: isActive ? m.color : m.chipBd },
                      }}
                    >
                      <Box sx={{ width: 34, height: 34, borderRadius: '9px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: m.tint }}>
                        <Icon sx={{ fontSize: 19, color: m.color }} />
                      </Box>
                      <Box sx={{ minWidth: 0, flex: 1 }}>
                        <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: isActive ? m.color : '#0f172a', whiteSpace: 'nowrap' }}>{m.label}</Typography>
                        <Typography sx={{ fontSize: '0.7rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                          {storedN > 0 ? `${storedN} uploaded` : 'none yet'}
                        </Typography>
                      </Box>
                      {stagedN > 0 && (
                        <Chip label={stagedN} size="small" sx={{ height: 20, minWidth: 20, fontSize: '0.68rem', fontWeight: 700, bgcolor: m.color, color: '#fff', '& .MuiChip-label': { px: 0.75 } }} />
                      )}
                    </Box>
                  );
                })}
              </Box>

              {/* Active kind uploader */}
              {(() => {
                const m = KIND_META[activeKind];
                const items = staging[activeKind];
                const stagedSize = items.reduce((s, p) => s + (p.size || 0), 0);
                const enabled = !!resolvedCenter;
                return (
                  <>
                    <Box
                      onClick={() => { if (enabled) fileInputRef.current?.click(); }}
                      onDragOver={(e) => { e.preventDefault(); if (enabled) setDragKind(activeKind); }}
                      onDragLeave={() => setDragKind(null)}
                      onDrop={(e) => { if (enabled) handleDrop(activeKind, e); else e.preventDefault(); }}
                      sx={{
                        border: '2px dashed',
                        borderColor: !enabled ? '#e2e8f0' : dragKind === activeKind ? m.color : '#cbd5e1',
                        bgcolor: !enabled ? '#f8fafc' : dragKind === activeKind ? m.tint : '#f8fafc',
                        borderRadius: 3, p: { xs: 3, sm: 4 }, textAlign: 'center',
                        cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.65, transition: 'all 0.15s ease',
                        '&:hover': enabled ? { borderColor: m.chipBd, bgcolor: m.tint } : {},
                      }}
                    >
                      <CloudUpload sx={{ fontSize: 42, color: !enabled ? '#cbd5e1' : dragKind === activeKind ? m.color : '#94a3b8', mb: 1 }} />
                      {enabled ? (
                        <>
                          <Typography sx={{ fontWeight: 600, color: '#334155', fontSize: '0.95rem' }}>
                            Drag & drop {m.label.toLowerCase()} here, or <Box component="span" sx={{ color: m.color }}>browse</Box>
                          </Typography>
                          <Typography sx={{ fontSize: '0.8rem', color: '#94a3b8', mt: 0.5 }}>
                            {activeKind === 'video' ? 'A .zip archive or multiple video files (mp4, mkv, mov…)' : 'A .zip archive or multiple image files (jpg, png, webp…)'}
                          </Typography>
                        </>
                      ) : (
                        <>
                          <Typography sx={{ fontWeight: 600, color: '#94a3b8', fontSize: '0.95rem' }}>Select or type a TC code to enable uploads</Typography>
                          <Typography sx={{ fontSize: '0.8rem', color: '#cbd5e1', mt: 0.5 }}>Choose a TC code above first.</Typography>
                        </>
                      )}
                      <input ref={fileInputRef} type="file" hidden multiple disabled={!enabled} accept={m.accept} onChange={handleFileInput} />
                    </Box>

                    {items.length > 0 && (
                      <Box sx={{ mt: 2.5 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                          <Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#475569' }}>
                            {items.length} file{items.length > 1 ? 's' : ''} ready · {formatBytes(stagedSize)}
                          </Typography>
                          <Button size="small" onClick={() => clearStaged(activeKind)} sx={{ color: '#64748b', textTransform: 'none', fontSize: '0.8rem' }}>Clear all</Button>
                        </Box>
                        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.25, maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
                          {items.map((p) => {
                            const FileIcon = p.isZip ? FolderZip : (activeKind === 'video' ? VideoFile : ImageIcon);
                            const iconColor = p.isZip ? '#d97706' : m.color;
                            const iconBg = p.isZip ? '#fef3c7' : m.tint;
                            return (
                              <Box key={p.key} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, pr: 1, borderRadius: 2.5, bgcolor: '#fff', border: '1px solid #e8ecf1', boxShadow: '0 1px 2px rgba(15,23,42,0.04)', transition: 'all 0.15s ease', '&:hover': { borderColor: p.isZip ? '#fcd34d' : m.chipBd, boxShadow: '0 4px 10px rgba(15,23,42,0.07)' } }}>
                                <Box sx={{ width: 38, height: 38, borderRadius: '10px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: iconBg }}>
                                  <FileIcon sx={{ color: iconColor, fontSize: 20 }} />
                                </Box>
                                <Box sx={{ minWidth: 0, flex: 1 }}>
                                  <Tooltip title={p.name}><Typography sx={{ fontSize: '0.85rem', fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</Typography></Tooltip>
                                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mt: 0.25 }}>
                                    <Typography sx={{ fontSize: '0.74rem', color: '#94a3b8' }}>{formatBytes(p.size)}</Typography>
                                    {p.isZip && <Chip label="Archive" size="small" sx={{ height: 17, fontSize: '0.63rem', fontWeight: 700, bgcolor: '#fef3c7', color: '#b45309' }} />}
                                  </Box>
                                </Box>
                                <IconButton size="small" onClick={() => removeStaged(activeKind, p.key)} sx={{ color: '#94a3b8', flexShrink: 0, '&:hover': { color: '#ef4444', bgcolor: '#fef2f2' } }}><Close sx={{ fontSize: 17 }} /></IconButton>
                              </Box>
                            );
                          })}
                        </Box>
                      </Box>
                    )}

                    <Box sx={{ display: 'flex', justifyContent: { xs: 'stretch', sm: 'flex-end' }, mt: 2.5 }}>
                      <Button
                        variant="contained" disableElevation startIcon={<UploadFile />}
                        onClick={() => handleStartUpload(activeKind)}
                        disabled={!resolvedCenter || items.length === 0}
                        sx={{
                          height: 44, px: 3, borderRadius: '10px', fontWeight: 600, textTransform: 'none',
                          width: { xs: '100%', sm: 'auto' }, bgcolor: m.color, '&:hover': { bgcolor: m.color, filter: 'brightness(0.92)' },
                          '&.Mui-disabled': { bgcolor: '#e2e8f0', color: '#94a3b8' },
                        }}
                      >
                        Upload {m.label.toLowerCase()}{items.length ? ` (${items.length})` : ''}
                      </Button>
                    </Box>
                  </>
                );
              })()}
            </Paper>

            {/* ── Active uploads ── */}
            {tasks.length > 0 && (
              <Paper sx={{ p: { xs: 2, sm: 2.5 }, mb: 3, borderRadius: 3, border: '1px solid #dbeafe', bgcolor: '#f8fbff', boxShadow: 'none' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                  {activeTasks.length > 0 && <CircularProgress size={16} thickness={5} sx={{ color: '#2563eb' }} />}
                  <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '0.95rem' }}>
                    {activeTasks.length > 0 ? `Uploading ${activeTasks.length} batch${activeTasks.length > 1 ? 'es' : ''}` : 'Recent uploads'}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                  {tasks.map((task) => {
                    const m = KIND_META[task.kind];
                    const Icon = m.icon;
                    return (
                      <Box key={task.id} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#fff', border: '1px solid #e8ecf1' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.75, gap: 1 }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0 }}>
                            <Box sx={{ width: 26, height: 26, borderRadius: '7px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: m.tint }}>
                              <Icon sx={{ fontSize: 15, color: m.color }} />
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                              <Typography sx={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a' }}>{task.tcCode} <Box component="span" sx={{ fontWeight: 500, color: '#94a3b8' }}>· {m.label}</Box></Typography>
                              {task.centreName && <Typography sx={{ fontSize: '0.72rem', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.centreName}</Typography>}
                            </Box>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
                            {task.status === 'done' && <Chip icon={<CheckCircle sx={{ fontSize: '16px !important', color: '#16a34a !important' }} />} label={`${task.savedCount} saved`} size="small" sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600, bgcolor: '#ecfdf5', color: '#16a34a' }} />}
                            {task.status === 'error' && <Chip icon={<ErrorOutline sx={{ fontSize: '16px !important', color: '#dc2626 !important' }} />} label="Failed" size="small" sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600, bgcolor: '#fef2f2', color: '#dc2626' }} />}
                            {task.status === 'cancelled' && <Chip icon={<Cancel sx={{ fontSize: '16px !important', color: '#f59e0b !important' }} />} label="Cancelled" size="small" sx={{ height: 22, fontSize: '0.72rem', fontWeight: 600, bgcolor: '#fef3c7', color: '#b45309' }} />}
                            {task.status === 'uploading' && (
                              <>
                                <Typography sx={{ fontSize: '0.78rem', color: '#64748b', fontWeight: 600 }}>{task.total} file{task.total > 1 ? 's' : ''} · {task.progress}%</Typography>
                                <Tooltip title="Cancel"><IconButton size="small" onClick={() => cancelTask(task.id)} sx={{ color: '#94a3b8', '&:hover': { color: '#dc2626', bgcolor: '#fef2f2' } }}><Cancel sx={{ fontSize: 18 }} /></IconButton></Tooltip>
                              </>
                            )}
                          </Box>
                        </Box>
                        <LinearProgress variant="determinate" value={task.progress}
                          sx={{ height: 7, borderRadius: 4, bgcolor: '#eef2f7', '& .MuiLinearProgress-bar': { borderRadius: 4, bgcolor: task.status === 'error' ? '#dc2626' : task.status === 'cancelled' ? '#f59e0b' : task.status === 'done' ? '#16a34a' : m.color } }} />
                      </Box>
                    );
                  })}
                </Box>
              </Paper>
            )}

              </Box>{/* end left column */}

              {/* Right column: server-backed list — updates right after each upload */}
              <Box sx={{ flex: 1, minWidth: 0, width: '100%' }}>

            {/* ── Uploaded list ── */}
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1.5, mb: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: '1.05rem' }}>Uploaded media</Typography>
                <Tooltip title="Refresh from server">
                  <IconButton size="small" onClick={refreshAll} sx={{ color: '#94a3b8', '&:hover': { color: '#2563eb', bgcolor: '#eff6ff' } }}>
                    {examTcs.loading ? <CircularProgress size={16} sx={{ color: '#94a3b8' }} /> : <Refresh sx={{ fontSize: 18 }} />}
                  </IconButton>
                </Tooltip>
              </Box>
              <TextField size="small" placeholder="Search TC code, center or file…" value={search} onChange={(e) => setSearch(e.target.value)}
                InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>, sx: { borderRadius: '8px', bgcolor: '#f8fafc', height: 40, fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } } }}
                sx={{ minWidth: { xs: '100%', sm: 300 } }} />
            </Box>

            {grouped.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 7, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e8ecf1' }}>
                {examTcs.loading ? (
                  <><CircularProgress size={28} sx={{ color: '#94a3b8', mb: 2 }} /><Typography sx={{ fontWeight: 600, color: '#334155' }}>Loading uploaded media…</Typography></>
                ) : (
                  <>
                    <Box sx={{ width: 68, height: 68, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mx: 'auto', mb: 2 }}><VideoFile sx={{ fontSize: 30, color: '#94a3b8' }} /></Box>
                    <Typography sx={{ fontWeight: 600, color: '#334155', mb: 0.5 }}>{examTcs.error ? 'Could not load uploads' : totalFiles === 0 ? 'Nothing uploaded for this exam yet' : 'No matches found'}</Typography>
                    <Typography sx={{ fontSize: '0.88rem', color: '#94a3b8' }}>{examTcs.error ? examTcs.error : totalFiles === 0 ? 'Pick a TC code above and upload media to see it here.' : 'Try a different search term.'}</Typography>
                  </>
                )}
              </Box>
            ) : (
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {grouped.map((group) => {
                  const isOpen = expanded[group.code] ?? false;
                  const sf = serverFiles[group.code] || {};
                  const filesByKind = sf.kinds || {};
                  return (
                    <Paper key={group.code} sx={{ borderRadius: 3, border: '1px solid #e8ecf1', boxShadow: 'none', overflow: 'hidden' }}>
                      <Box onClick={() => openGroup(group.code)} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, px: { xs: 2, sm: 2.5 }, py: 1.75, cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc' } }}>
                        <Box sx={{ width: 36, height: 36, borderRadius: '10px', bgcolor: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><MeetingRoom sx={{ color: '#2563eb', fontSize: 20 }} /></Box>
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontWeight: 700, color: '#0f172a', fontSize: { xs: '0.88rem', sm: '0.95rem' }, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {group.code}{group.centreName ? <Box component="span" sx={{ fontWeight: 500, color: '#64748b' }}> — {group.centreName}</Box> : null}
                          </Typography>
                          <Typography sx={{ fontSize: { xs: '0.72rem', sm: '0.78rem' }, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {group.total} file{group.total !== 1 ? 's' : ''}{group.latest ? ` · updated ${formatDateTime(group.latest)}` : ''}
                          </Typography>
                        </Box>
                        <Box sx={{ display: { xs: 'none', sm: 'block' } }}><KindChips kinds={group.kinds} /></Box>
                        <ExpandMore sx={{ color: '#94a3b8', flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                      </Box>

                      <Collapse in={isOpen} timeout="auto" unmountOnExit>
                        <Box sx={{ borderTop: '1px solid #eef2f7', p: { xs: 1.5, sm: 2 }, display: 'flex', flexDirection: 'column', gap: 2 }}>
                          {sf.loading && <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, color: '#94a3b8', fontSize: '0.83rem' }}><CircularProgress size={14} sx={{ color: '#94a3b8' }} /> Loading files…</Box>}
                          {sf.error && !sf.loading && <Typography sx={{ color: '#dc2626', fontSize: '0.83rem' }}>{sf.error}</Typography>}
                          {!sf.loading && !sf.error && KIND_ORDER.map((k) => {
                            const files = filesByKind[k] || [];
                            if (!files.length && (group.kinds?.[k]?.count || 0) === 0) return null;
                            const m = KIND_META[k];
                            const Icon = m.icon;
                            return (
                              <Box key={k}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
                                  <Icon sx={{ fontSize: 16, color: m.color }} />
                                  <Typography sx={{ fontSize: '0.8rem', fontWeight: 700, color: m.color }}>{m.label}</Typography>
                                  <Typography sx={{ fontSize: '0.75rem', color: '#94a3b8' }}>· {files.length} file{files.length !== 1 ? 's' : ''}</Typography>
                                </Box>
                                <TableContainer sx={{ border: '1px solid #eef2f7', borderRadius: 2, overflowX: 'auto' }}>
                                  <Table size="small">
                                    <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                      <TableRow>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: '#64748b' }}>File</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: '#64748b', display: { xs: 'none', sm: 'table-cell' } }}>Size</TableCell>
                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.73rem', color: '#64748b', display: { xs: 'none', md: 'table-cell' } }}>Uploaded</TableCell>
                                      </TableRow>
                                    </TableHead>
                                    <TableBody>
                                      {files.length === 0 && <TableRow><TableCell colSpan={3} sx={{ color: '#94a3b8', fontSize: '0.82rem' }}>None</TableCell></TableRow>}
                                      {files.map((f, idx) => (
                                        <TableRow key={`${k}-${f.name}-${idx}`} hover sx={{ '&:hover': { bgcolor: '#f8fafc' } }}>
                                          <TableCell sx={{ maxWidth: 340 }}>
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                              <Icon sx={{ color: m.color, fontSize: 17, flexShrink: 0 }} />
                                              <Tooltip title={f.name}><Typography sx={{ fontSize: '0.84rem', color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</Typography></Tooltip>
                                            </Box>
                                          </TableCell>
                                          <TableCell sx={{ fontSize: '0.84rem', color: '#475569', display: { xs: 'none', sm: 'table-cell' } }}>{formatBytes(f.size_bytes)}</TableCell>
                                          <TableCell sx={{ fontSize: '0.81rem', color: '#64748b', display: { xs: 'none', md: 'table-cell' } }}>{formatDateTime(f.modified)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </TableContainer>
                              </Box>
                            );
                          })}
                        </Box>
                      </Collapse>
                    </Paper>
                  );
                })}
              </Box>
            )}

              </Box>{/* end right column */}
            </Box>{/* end side-by-side row */}
          </>
        )}
      </Box>

      <Snackbar open={snack.open} autoHideDuration={3500} onClose={() => setSnack((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <Alert onClose={() => setSnack((s) => ({ ...s, open: false }))} severity={snack.severity} variant="filled" sx={{ width: '100%' }}>{snack.message}</Alert>
      </Snackbar>
    </Box>
  );
};

export default ClientVideoUploads;

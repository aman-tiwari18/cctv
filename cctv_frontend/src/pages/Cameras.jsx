import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Chip,
  CircularProgress, Alert, Tooltip, Divider, Stack, TablePagination,
  FormControl, InputLabel, Select, InputAdornment, TableSortLabel,
} from '@mui/material';
import {
  Add, Edit, Delete, Upload, CloudUpload, Download,
  TableChart, ChevronRight, Search,
  Videocam as VideocamIcon,
  KeyboardArrowLeft,
  KeyboardArrowRight,
} from '@mui/icons-material';
import CameraAltIcon from '@mui/icons-material/CameraAlt';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { camerasAPI, examsAPI } from '../services/api';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon'


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

const HLS_EMPTY = {
  centre_name: '', tc_code: '', city: '', state: '',
  camera_name: '', ch_code: '', cctv_url: '', camera_category: '',
  classification: '', exam_date: '', shift_id: '',
};
const RTSP_EMPTY = {
  device_id: '', tc_code: '', camera_name: '', centre_name: '',
  city: '', state: '', cctv_url: '', classification: '',
};

// ─────────────────────────────────────────────────────────────
const Cameras = () => {
  const [searchParams] = useSearchParams();
  const examIdParam = searchParams.get('exam');

  /* ── Sidebar ── */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exams, setExams] = useState([]);
  const [viewingArchived, setViewingArchived] = useState(false);
  const [selectedExamId, setSelectedExamId] = useState(examIdParam || '');


  const [cameras, setCameras] = useState([]);
  const [examLinkType, setExamLinkType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusCounts, setStatusCounts] = useState({ accessible: 0, notAccessible: 0, unknown: 0 });

  /* ── Search & Sort ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [order, setOrder] = useState('asc');

  const [filterShiftId, setFilterShiftId] = useState('');
  const [filterExamDate, setFilterExamDate] = useState('');


  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);


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

  useEffect(() => { loadExams(); }, [viewingArchived]);

  const loadExams = async () => {
    try {
      const res = await examsAPI.getAll({ is_active: !viewingArchived });
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


  useEffect(() => {
    if (selectedExamId) { loadCameras(); }
    else { setCameras([]); setTotalCount(0); }
    setFilterShiftId('');
    setFilterExamDate('');
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setPage(0);
  }, [selectedExamId]);

  useEffect(() => {
    if (selectedExamId) loadCameras();
  }, [page, rowsPerPage, filterShiftId, filterExamDate, debouncedSearchQuery]);

  const loadCameras = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      const params = { is_active: true, page: page + 1, limit: rowsPerPage };
      if (filterShiftId) params.shift_id = filterShiftId;
      if (filterExamDate) params.exam_date = parseDDMMYYYYToISO(filterExamDate);
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      const res = await camerasAPI.getByExam(selectedExamId, params);
      setCameras(res.data.data || []);
      setTotalCount(res.data.totalCount || (res.data.data || []).length);
      setExamLinkType(res.data.linkType);
      setStatusCounts(res.data.statusCounts || { accessible: 0, notAccessible: 0, unknown: 0 });
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedExamId, page, rowsPerPage, filterShiftId, filterExamDate, debouncedSearchQuery]);

  /* ── Derived ── */
  const selectedExamData = exams.find((e) => String(e.id) === String(selectedExamId));
  const isHLS = examLinkType === 'HLS' || selectedExamData?.link_type?.toUpperCase() === 'HLS';
  const shifts = selectedExamData?.examShifts || [];

  /* ── Sorting logic ── */
  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const sortedCameras = React.useMemo(() => {
    if (!orderBy) return cameras;

    const comparator = (a, b) => {
      let aVal = a[orderBy];
      let bVal = b[orderBy];

      // Handle nested properties
      if (orderBy === 'shift_name') {
        const shiftA = shifts.find(s => s.id === a.shift_id);
        const shiftB = shifts.find(s => s.id === b.shift_id);
        aVal = shiftA?.shift_name || '';
        bVal = shiftB?.shift_name || '';
      }

      // Handle null/undefined
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';

      // String comparison
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();

      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
      return 0;
    };

    return [...cameras].sort(comparator);
  }, [cameras, orderBy, order, shifts]);

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
          state: camera.state || '', cctv_url: camera.cctv_url || camera.url || '',
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

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc' }}>


        <Box sx={{
          width: sidebarOpen ? 280 : 56, flexShrink: 0,
          borderRight: '1px solid #e8ecf1', bgcolor: '#fff',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}>

          {/* Sidebar header + collapse toggle */}
          <Box sx={{ px: sidebarOpen ? 2.5 : 1, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center' }}>
            {sidebarOpen && (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap:1 }}>
                <ExamsSvgIcon sx={{ fontSize: 17, color: '#64748b' }} />
                <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>
                  {viewingArchived ? 'Archived Exams' : 'Available Exams'}
                </Typography>
              </Box>
            )}
            <Tooltip title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'} placement="right">
              <IconButton
                size="small"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                sx={{
                  color: '#fff',
                  bgcolor: 'primary.main',
                  '&:hover': { bgcolor: 'primary.dark' },
                  borderRadius: 2,
                  width: 32,
                  height: 32,
                }}
              >
                {sidebarOpen ? (
                  <KeyboardArrowLeft sx={{ fontSize: 20 }} />
                ) : (
                  <KeyboardArrowRight sx={{ fontSize: 20 }} />
                )}
              </IconButton>
            </Tooltip>
          </Box>

          {/* Exam list */}
          <Box sx={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
            {exams.map((exam) => {
              const active = String(exam.id) === String(selectedExamId);
              return (
                <Tooltip key={exam.id} title={!sidebarOpen ? `${exam.exam_name} (${exam.exam_body})` : ''} placement="right">
                  <Box
                    onClick={() => setSelectedExamId(String(exam.id))}
                    sx={{
                      display: 'flex', alignItems: 'center',
                      justifyContent: sidebarOpen ? 'space-between' : 'center',
                      px: sidebarOpen ? 2.5 : 0, py: 1.8, cursor: 'pointer',
                      borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                      bgcolor: active ? '#f0f6ff' : 'transparent',
                      transition: 'all 0.15s ease',
                      '&:hover': { bgcolor: active ? '#f0f6ff' : '#f8fafc' },
                    }}
                  >
                    {sidebarOpen ? (
                      <>
                        <Typography sx={{ fontSize: '0.88rem', fontWeight: active ? 600 : 400, color: active ? '#3b82f6' : '#334155', lineHeight: 1.4, pr: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {exam.exam_name} ({exam.exam_body})
                        </Typography>
                        <ChevronRight sx={{ fontSize: 20, color: active ? '#3b82f6' : '#94a3b8', flexShrink: 0 }} />
                      </>
                    ) : (
                      /* Collapsed: show first letter of exam name in a styled box */
                      <Box sx={{
                        width: 34, height: 34, borderRadius: 2,
                        bgcolor: active ? '#2563eb' : '#f1f5f9',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                        border: active ? 'none' : '1px solid #e2e8f0',
                      }}>
                        <Typography sx={{ 
                          fontSize: '0.9rem', 
                          fontWeight: 700, 
                          color: active ? '#fff' : '#64748b',
                          textTransform: 'uppercase'
                        }}>
                          {exam.exam_name.charAt(0)}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Tooltip>
              );
            })}
            {exams.length === 0 && sidebarOpen && (
              <Typography sx={{ px: 2.5, py: 2, fontSize: '0.82rem', color: '#94a3b8' }}>No exams found.</Typography>
            )}
          </Box>

          {/* Toggle archived */}
          {sidebarOpen && (
            <Box sx={{ px: 2.5, py: 2 }}>
              <Button variant="outlined" fullWidth
                onClick={() => { setViewingArchived(!viewingArchived); setSelectedExamId(''); }}
                sx={{ textTransform: 'uppercase', fontWeight: 500, fontSize: '0.72rem', letterSpacing: '0.04em', borderColor: '#cbd5e1', color: '#777', borderRadius: 2, py: 1, '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' } }}
              >
                {viewingArchived ? 'View Active Exams' : 'View Archived Exams'}
              </Button>
            </Box>
          )}
        </Box>

        {/* ════ RIGHT PANEL ════ */}
        <Box sx={{ flex: 1, p: 3.5, overflowY: 'auto', minWidth: 0 }}>

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
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                    <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: '1.5rem' }}>
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
                  <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>
                    {totalCount} camera{totalCount !== 1 ? 's' : ''} • {isHLS ? 'HLS streams' : 'RTSP streams'}
                  </Typography>
                </Box>

                {/* Far-right: filters + action buttons */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0 }}>
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
                    sx={{ minWidth: 260, maxWidth: 300 }}
                  />

                  {/* HLS filters */}
                  {isHLS && (
                    <>
                      <FormControl size="small" sx={{ minWidth: 140 }}>
                        <InputLabel id="cam-shift-label">Shift</InputLabel>
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

                      {/* Native date input — same style as Detections.jsx */}
                      <Box sx={{ position: 'relative', minWidth: 150 }}>
                        <TextField
                          type="date"
                          size="small"
                          value={filterExamDate ? filterExamDate.split('-').reverse().join('-') : ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val) {
                              const [y, m, d] = val.split('-');
                              setFilterExamDate(`${d}-${m}-${y}`);
                            } else {
                              setFilterExamDate('');
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
                            },
                          }}
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
                    </>
                  )}

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

                  <Button variant="outlined" startIcon={<CloudUpload />}
                    onClick={() => { setOpenUpload(true); setUploadError(''); setUploadFile(null); setUploadShiftId(''); setUploadDate(''); }}
                    sx={{ textTransform: 'none', fontWeight: 600 }}>
                    Upload Excel
                  </Button>

                </Box>
              </Box>

              {cameras.length > 0 && cameras.some(cam => cam.status !== null && cam.status !== undefined) && (
                <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: 'end' }}>

                  <Box sx={{
                    height: 30,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 1,
                    borderRadius: 2,
                    border: '1px solid #3c81f6',
                  }}>
                    <Box sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                    }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', color: 'primary.main', fontWeight: 600 }}>
                        Accessible
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: 'primary.main' }}>
                        {statusCounts.accessible}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{
                    height: 30,
                    px: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    borderRadius: 2,
                    border: '1px solid #333',
                  }}>
                    <Box sx={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                    }} />
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography sx={{ fontSize: '0.75rem', color: '#777', fontWeight: 600 }}>
                        Not Accessible
                      </Typography>
                      <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, color: '#777' }}>
                        {statusCounts.notAccessible}
                      </Typography>
                    </Box>
                  </Box>

                  {/* Unknown */}
                  {statusCounts.unknown > 0 && (
                    <Box sx={{
                      px: 2,
                      height: 30,
                      display: 'flex',
                      alignItems: 'center',
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
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setUploadResult(null)}>
                  {uploadResult.message}
                </Alert>
              )}

              {/* ── Table ── */}
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
              ) : sortedCameras.length > 0 ? (
                <>
                  <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none' }}>
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
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                                <TableSortLabel
                                  active={orderBy === 'classification'}
                                  direction={orderBy === 'classification' ? order : 'asc'}
                                  onClick={() => handleRequestSort('classification')}
                                >
                                  Classification
                                </TableSortLabel>
                              </TableCell>
                            </>
                          )}
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 250 }}>CCTV URL</TableCell>
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
                                <TableCell>
                                  {cam.ch_code ? <Chip label={cam.ch_code} size="small" variant="outlined" /> : '-'}
                                </TableCell>
                                <TableCell>
                                  <Chip label={cam.camera_category || 'N/A'} size="small" />
                                </TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{cam.classification || '-'}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>{formatDateDDMMYYYY(cam.exam_date) || '-'}</TableCell>
                                <TableCell sx={{ fontSize: '0.85rem' }}>
                                  {cam.shift_id
                                    ? (shifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
                                    : <Chip label="All shifts" size="small" color="default" variant="outlined" />}
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
                                <TableCell sx={{ fontSize: '0.85rem' }}>{cam.classification || '-'}</TableCell>
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
                    rowsPerPageOptions={[10, 25, 50, 100, 200, 500]}
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
          sx={{ '& .MuiDialog-container': { alignItems: 'flex-start', pt: 10 } }}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudUpload /> Upload Camera Links Excel
          </DialogTitle>
          <DialogContent sx={{ overflow: 'visible' }}>
            {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}
            <Alert severity="info" sx={{ mb: 2 }}>
              {isHLS
                ? 'Expected HLS columns: TC Code, Centre Name, City, State, Camera Name, ch_no, CCTV URL, Camera Category, Classification (optional)'
                : 'Expected RTSP columns: Device ID, TC Code, Camera Name, Centre Name, City, State, Server Address, Classification (or Room Classification - optional)'}
              <br /><strong>Download the template below to get the exact format.</strong>
            </Alert>
            <Button variant="outlined" component="label" fullWidth startIcon={<Upload />} sx={{ mb: 2 }}>
              {uploadFile ? uploadFile.name : 'Choose Excel File (.xlsx / .xls)'}
              <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => { setUploadFile(e.target.files[0]); setUploadError(''); }} />
            </Button>
            {isHLS && (
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, mt: 1 }}>
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

      </Box>
    </LocalizationProvider>
  );
};

export default Cameras;
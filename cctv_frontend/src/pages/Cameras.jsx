import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Chip,
  CircularProgress, Alert, Tooltip, Divider, Stack, TablePagination,
  FormControl, InputLabel, Select,
} from '@mui/material';
import {
  Add, Edit, Delete, Upload, CloudUpload, Download,
  TableChart, ChevronRight,
  Videocam as VideocamIcon,
} from '@mui/icons-material';
import AssignmentIcon from '@mui/icons-material/Assignment';
import { ExamsSvgIcon } from '../components/ExamsSvgIcon';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { camerasAPI, examsAPI } from '../services/api';


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

  /* ── Data ── */
  const [cameras, setCameras] = useState([]);
  const [examLinkType, setExamLinkType] = useState(null);
  const [loading, setLoading] = useState(false);

  /* ── Far-right filters ── */
  const [filterShiftId, setFilterShiftId] = useState('');
  const [filterExamDate, setFilterExamDate] = useState('');

  /* ── Pagination ── */
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  /* ── Create / Edit dialog ── */
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


  useEffect(() => {
    if (selectedExamId) { loadCameras(); }
    else { setCameras([]); setTotalCount(0); }
    setFilterShiftId('');
    setFilterExamDate('');
    setPage(0);
  }, [selectedExamId]);

  useEffect(() => {
    if (selectedExamId) loadCameras();
  }, [page, rowsPerPage, filterShiftId, filterExamDate]);

  const loadCameras = useCallback(async () => {
    if (!selectedExamId) return;
    setLoading(true);
    try {
      const params = { is_active: true, page: page + 1, limit: rowsPerPage };
      if (filterShiftId) params.shift_id = filterShiftId;
      if (filterExamDate) params.exam_date = parseDDMMYYYYToISO(filterExamDate);
      const res = await camerasAPI.getByExam(selectedExamId, params);
      setCameras(res.data.data || []);
      setTotalCount(res.data.totalCount || (res.data.data || []).length);
      setExamLinkType(res.data.linkType);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedExamId, page, rowsPerPage, filterShiftId, filterExamDate]);

  /* ── Derived ── */
  const selectedExamData = exams.find((e) => String(e.id) === String(selectedExamId));
  const isHLS = examLinkType === 'HLS' || selectedExamData?.link_type?.toUpperCase() === 'HLS';
  const shifts = selectedExamData?.examShifts || [];

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

  /* ── Upload ── */
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

  const handleDownloadTemplate = async (type) => {
    if (!selectedExamId) return;
    try { await camerasAPI.downloadTemplate(selectedExamId, type); }
    catch { alert('Download failed'); }
  };

  /* ════════════════════════════════════════════════════
     RENDER
  ═════════════════════════════════════════════════════ */
  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc' }}>

        {/* ════ LEFT SIDEBAR ════ */}
        <Box sx={{
          width: sidebarOpen ? 280 : 56, flexShrink: 0,
          borderRight: '1px solid #e8ecf1', bgcolor: '#fff',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transition: 'width 0.22s cubic-bezier(0.4,0,0.2,1)',
        }}>

          {/* Sidebar header + collapse toggle */}
          <Box sx={{ px: sidebarOpen ? 2.5 : 1, pt: 2.5, pb: 1.5, display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'space-between' : 'center' }}>
            {sidebarOpen && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <VideocamIcon sx={{ fontSize: 17, color: '#64748b' }} />
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
                  bgcolor: '#2563eb',
                  '&:hover': { bgcolor: '#1d4ed8' },
                  borderRadius: 2,
                  width: 32,
                  height: 32,
                }}
              >
                <ExamsSvgIcon sx={{ fontSize: 20 }} />
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
                      /* Collapsed: show AssignmentIcon — blue box if active, plain icon if inactive */
                      <Box sx={{
                        width: 34, height: 34, borderRadius: 2,
                        bgcolor: active ? '#2563eb' : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        transition: 'background 0.15s',
                      }}>
                        <AssignmentIcon sx={{ fontSize: 18, color: active ? '#fff' : '#94a3b8' }} />
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
                <VideocamIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to view cameras</Typography>
              <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>
                Choose an exam from the sidebar to manage CCTV camera links.
              </Typography>
            </Box>
          ) : (
            <>
              {/* ── Title row ── */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3.5, flexWrap: 'wrap', gap: 2 }}>
                <Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                    <Typography variant="h4" sx={{ fontWeight: 800, color: '#0f172a' }}>
                      {selectedExamData ? `${selectedExamData.exam_name} (${selectedExamData.exam_body})` : 'Cameras'}
                    </Typography>
                    {selectedExamData && (
                      <Chip
                        label={examLinkType || selectedExamData.link_type}
                        size="small"
                        sx={{
                          fontWeight: 700, fontSize: '0.7rem', height: 20, borderRadius: '6px',
                          bgcolor: isHLS ? '#1d4ed8' : '#dc4d00', color: '#fff'
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
                    <Button variant="outlined" size="small" startIcon={<TableChart />}
                      onClick={() => handleDownloadTemplate('hls')}
                      sx={{ borderColor: '#1d4ed8', color: '#1d4ed8', '&:hover': { bgcolor: '#ecfeff' }, textTransform: 'none', fontWeight: 600 }}>
                      HLS
                    </Button>
                  </Tooltip>
                  <Tooltip title="Download RTSP Template">
                    <Button variant="outlined" size="small" startIcon={<TableChart />}
                      onClick={() => handleDownloadTemplate('rtsp')}
                      sx={{ borderColor: '#a4b5fe', color: '#384b91', '&:hover': { bgcolor: '#f5f3ff' }, textTransform: 'none', fontWeight: 600 }}>
                      RTSP
                    </Button>
                  </Tooltip>

                  <Button variant="outlined" startIcon={<CloudUpload />}
                    onClick={() => { setOpenUpload(true); setUploadError(''); }}
                    sx={{ textTransform: 'none', fontWeight: 600 }}>
                    Upload Excel
                  </Button>

                  <Button variant="contained" startIcon={<Add />}
                    onClick={() => handleOpenDialog()}
                    sx={{ textTransform: 'none', fontWeight: 600 }}>
                    Add Camera
                  </Button>
                </Box>
              </Box>

              {/* Upload result alert */}
              {uploadResult && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setUploadResult(null)}>
                  {uploadResult.message}
                </Alert>
              )}

              {/* ── Table ── */}
              {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
              ) : cameras.length > 0 ? (
                <>
                  <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none' }}>
                    <Table size="small">
                      <TableHead sx={{ bgcolor: '#f8fafc' }}>
                        <TableRow>
                          {isHLS ? (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Centre Name</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>TC Code</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>State</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Camera / Lab</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Ch Code</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Category</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Classification</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Exam Date</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Shift</TableCell>
                            </>
                          ) : (
                            <>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Device ID</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Camera No</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>TC Code</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Camera Name</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Centre Name</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>State</TableCell>
                              <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Classification</TableCell>
                            </>
                          )}
                          <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>CCTV URL</TableCell>
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
                            <TableCell sx={{ maxWidth: 220 }}>
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

        {/* ── Create / Edit Dialog ── */}
        <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
          <DialogTitle>{editingCamera ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
          <DialogContent>
            {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
            {isHLS ? (
              <>
                <TextField fullWidth label="Centre Name" value={formData.centre_name || ''} onChange={(e) => setFormData({ ...formData, centre_name: e.target.value })} margin="dense" size="small" />
                <TextField fullWidth label="TC Code" value={formData.tc_code || ''} onChange={(e) => setFormData({ ...formData, tc_code: e.target.value })} margin="dense" size="small" />
                <Box display="flex" gap={1}>
                  <TextField fullWidth label="City" value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })} margin="dense" size="small" />
                  <TextField fullWidth label="State" value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })} margin="dense" size="small" />
                </Box>
                <TextField fullWidth label="Camera / Lab Name" value={formData.camera_name || ''} onChange={(e) => setFormData({ ...formData, camera_name: e.target.value })} margin="dense" size="small" />
                <TextField fullWidth label="Ch Code" value={formData.ch_code || ''} onChange={(e) => setFormData({ ...formData, ch_code: e.target.value })} margin="dense" size="small" />
                <TextField fullWidth label="CCTV URL" value={formData.cctv_url || ''} onChange={(e) => setFormData({ ...formData, cctv_url: e.target.value })} margin="dense" size="small" required />
                <TextField fullWidth label="Camera Category" value={formData.camera_category || ''} onChange={(e) => setFormData({ ...formData, camera_category: e.target.value })} margin="dense" size="small" />
                <TextField fullWidth label="Classification" value={formData.classification || ''} onChange={(e) => setFormData({ ...formData, classification: e.target.value })} margin="dense" size="small" />
                <DatePicker
                  label="Exam Date"
                  value={parseDDMMYYYYToDate(formData.exam_date)}
                  onChange={(date) => setFormData({ ...formData, exam_date: formatDateDDMMYYYY(date) })}
                  inputFormat="dd-MM-yyyy"
                  renderInput={(params) => <TextField {...params} fullWidth margin="dense" size="small" />}
                />
                <TextField select fullWidth label="Shift (blank = all shifts)" value={formData.shift_id || ''}
                  onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                  margin="dense" size="medium"
                  SelectProps={{
                    displayEmpty: true, renderValue: (value) => {
                      if (!value) return 'All shifts';
                      return shifts.find((s) => String(s.id) === String(value))?.shift_name || `#${value}`;
                    }
                  }}>
                  <MenuItem value="">All shifts</MenuItem>
                  {shifts.map((s) => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                </TextField>
              </>
            ) : (
              <>
                <TextField fullWidth label="Device ID" value={formData.device_id || ''} onChange={(e) => setFormData({ ...formData, device_id: e.target.value })} margin="dense" size="small" required />
                <TextField fullWidth label="TC Code" value={formData.tc_code || ''} onChange={(e) => setFormData({ ...formData, tc_code: e.target.value })} margin="dense" size="small" />
                <TextField fullWidth label="Camera Name" value={formData.camera_name || ''} onChange={(e) => setFormData({ ...formData, camera_name: e.target.value })} margin="dense" size="small" required />
                <TextField fullWidth label="Centre Name" value={formData.centre_name || ''} onChange={(e) => setFormData({ ...formData, centre_name: e.target.value })} margin="dense" size="small" />
                <Box display="flex" gap={1}>
                  <TextField fullWidth label="City" value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })} margin="dense" size="small" />
                  <TextField fullWidth label="State" value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })} margin="dense" size="small" />
                </Box>
                <TextField fullWidth label="CCTV URL" value={formData.cctv_url || ''} onChange={(e) => setFormData({ ...formData, cctv_url: e.target.value })} margin="dense" size="small" required />
                <TextField fullWidth label="Classification" value={formData.classification || ''} onChange={(e) => setFormData({ ...formData, classification: e.target.value })} margin="dense" size="small" />
              </>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
            <Button onClick={handleSubmit} variant="contained">{editingCamera ? 'Save Changes' : 'Add Camera'}</Button>
          </DialogActions>
        </Dialog>

        {/* ── Upload Dialog ── */}
        <Dialog open={openUpload} onClose={() => setOpenUpload(false)} maxWidth="sm" fullWidth
          PaperProps={{ sx: { overflow: 'visible', minHeight: 380 } }}
          sx={{ '& .MuiDialog-container': { alignItems: 'flex-start', pt: 10 } }}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CloudUpload /> Upload Camera Links Excel
          </DialogTitle>
          <DialogContent sx={{ overflow: 'visible' }}>
            {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}
            <Alert severity="info" sx={{ mb: 2 }}>
              {isHLS
                ? 'Expected HLS columns: TC Code, Centre Name, City, State, Camera Name, ch_no, CCTV URL, Camera Category'
                : 'Expected RTSP columns: Device ID, TC Code, Camera Name, Centre Name, City, State, Server Address'}
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
              <Tooltip title="Download blank HLS template">
                <Button size="small" startIcon={<Download />} onClick={() => handleDownloadTemplate('hls')} sx={{ color: '#06b6d4' }}>HLS Template</Button>
              </Tooltip>
              <Tooltip title="Download blank RTSP template">
                <Button size="small" startIcon={<Download />} onClick={() => handleDownloadTemplate('rtsp')} sx={{ color: '#8b5cf6' }}>RTSP Template</Button>
              </Tooltip>
            </Box>
            <Box display="flex" gap={1}>
              <Button onClick={() => setOpenUpload(false)}>Cancel</Button>
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
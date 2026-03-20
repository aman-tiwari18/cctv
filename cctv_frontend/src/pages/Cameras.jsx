import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Button, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, TextField, MenuItem, Chip,
  CircularProgress, Alert, Tooltip, Divider, Stack, TablePagination
} from '@mui/material';
import {
  Add, Edit, Delete, Upload, CloudUpload, Download,
  TableChart, Refresh,
} from '@mui/icons-material';
import { camerasAPI, examsAPI, shiftsAPI } from '../services/api';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const truncate = (str, n = 40) =>
  str && str.length > n ? str.slice(0, n) + '…' : str;

const HLS_EMPTY   = {
  centre_name: '', tc_code: '', city: '', state: '',
  camera_name: '', ch_code: '', cctv_url: '', camera_category: '',
  classification: '', exam_date: '', shift_id: '',
};
const RTSP_EMPTY  = {
  tc_name: '', tc_code: '', camera_name: '', city: '',
  state: '', url: '', camera_category: '',
};

// ─────────────────────────────────────────────────────────────
const Cameras = () => {
  const [searchParams] = useSearchParams();
  const examIdParam = searchParams.get('exam');

  const [exams, setExams]               = useState([]);
  const [selectedExam, setSelectedExam] = useState(examIdParam || '');
  const [cameras, setCameras]           = useState([]);
  const [examLinkType, setExamLinkType] = useState(null);
  const [loading, setLoading]           = useState(false);
  
  // Pagination
  const [page, setPage]                 = useState(0);
  const [rowsPerPage, setRowsPerPage]   = useState(50);
  const [totalCount, setTotalCount]     = useState(0);

  // Create / Edit dialog
  const [openDialog, setOpenDialog]     = useState(false);
  const [editingCamera, setEditingCamera] = useState(null);
  const [formData, setFormData]         = useState(HLS_EMPTY);
  const [formError, setFormError]       = useState('');

  // Upload dialog
  const [openUpload, setOpenUpload]     = useState(false);
  const [uploadFile, setUploadFile]     = useState(null);
  const [uploadShiftId, setUploadShiftId] = useState('');
  const [uploadDate, setUploadDate]     = useState('');
  const [uploadError, setUploadError]   = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading]       = useState(false);

  // ── Load exams ──────────────────────────────────────────────
  useEffect(() => { loadExams(); }, []);

  // ── Load cameras when dependencies change ───────────────────
  useEffect(() => {
    if (selectedExam) {
      loadCameras();
    } else {
      setCameras([]);
      setTotalCount(0);
    }
  }, [selectedExam, page, rowsPerPage]);

  const loadExams = async () => {
    try {
      const res = await examsAPI.getAll({ is_active: true });
      setExams(res.data.data);
    } catch (e) { console.error(e); }
  };

  const loadCameras = useCallback(async () => {
    if (!selectedExam) return;
    setLoading(true);
    try {
      const res = await camerasAPI.getByExam(selectedExam, { 
        is_active: true,
        page: page + 1,
        limit: rowsPerPage
      });
      setCameras(res.data.data || []);
      setTotalCount(res.data.totalCount || (res.data.data || []).length);
      setExamLinkType(res.data.linkType);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [selectedExam, page, rowsPerPage]);

  // ── Derived ─────────────────────────────────────────────────
  const selectedExamData = exams.find((e) => e.id === Number(selectedExam));
  const isHLS = examLinkType === 'HLS' || selectedExamData?.link_type?.toUpperCase() === 'HLS';
  const shifts = selectedExamData?.examShifts || [];

  // ── Create / Edit ───────────────────────────────────────────
  const handleOpenDialog = (camera = null) => {

    if (camera) {
      setEditingCamera(camera);
      setFormData(isHLS
        ? { centre_name: camera.centre_name || '', tc_code: camera.tc_code || '',
            city: camera.city || '', state: camera.state || '',
            camera_name: camera.camera_name || '', ch_code: camera.ch_code || '',
            cctv_url: camera.cctv_url || '', camera_category: camera.camera_category || '',
            classification: camera.classification || '',
            exam_date: camera.exam_date || '', shift_id: camera.shift_id || '' }
        : { tc_name: camera.tc_name || '', tc_code: camera.tc_code || '',
            camera_name: camera.camera_name || '', city: camera.city || '',
            state: camera.state || '', url: camera.url || '',
            camera_category: camera.camera_category || '' });
    } else {
      setEditingCamera(null);
      setFormData(isHLS ? { ...HLS_EMPTY } : { ...RTSP_EMPTY });
    }
    setFormError('');
    setOpenDialog(true);
  };

  const handleSubmit = async () => {
    if (!selectedExam) { setFormError('Select an exam first'); return; }
    try {
      if (editingCamera) {
        await camerasAPI.update(editingCamera.id, formData, selectedExam);
      } else {
        await camerasAPI.create(selectedExam, formData);
      }
      setOpenDialog(false);
      loadCameras();
    } catch (e) {
      setFormError(e.response?.data?.message || 'Operation failed');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this camera?')) return;
    try { await camerasAPI.delete(id, selectedExam); loadCameras(); }
    catch { alert('Failed to delete'); }
  };

  // ── Upload ──────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!uploadFile || !selectedExam) { setUploadError('Select a file'); return; }
    setUploading(true);
    setUploadError('');
    try {
      const res = await camerasAPI.uploadExcel(selectedExam, uploadFile, {
        shiftId: uploadShiftId || undefined,
        examDate: uploadDate   || undefined,
      });
      setUploadResult(res.data);
      setOpenUpload(false);
      setUploadFile(null);
      setUploadShiftId('');
      setUploadDate('');
      loadCameras();
    } catch (e) {
      setUploadError(e.response?.data?.message || 'Upload failed');
    } finally { setUploading(false); }
  };

  // ── Template download ───────────────────────────────────────
  const handleDownloadTemplate = async (type) => {
    if (!selectedExam) return;
    try { await camerasAPI.downloadTemplate(selectedExam, type); }
    catch { alert('Download failed'); }
  };

  return (
    <Box>
      {/* ── Header ───────────────────────────────────────────── */}
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom>Camera Links</Typography>
          <Typography variant="body1" color="text.secondary">
            Manage CCTV stream URLs
            {selectedExamData && (
              <Chip label={examLinkType || selectedExamData.link_type} size="small"
                sx={{ ml: 1, fontWeight: 700 }} color={isHLS ? 'info' : 'secondary'} />
            )}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap" justifyContent="flex-end">
          {/* Template download buttons — only when exam selected */}
          {selectedExam && (
            <>
              <Tooltip title="Download blank HLS template Excel">
                <Button variant="outlined" size="small" startIcon={<TableChart />}
                  onClick={() => handleDownloadTemplate('hls')}
                  sx={{ borderColor: '#06b6d4', color: '#06b6d4', '&:hover': { bgcolor: '#ecfeff' } }}>
                  HLS Template
                </Button>
              </Tooltip>
              <Tooltip title="Download blank RTSP template Excel">
                <Button variant="outlined" size="small" startIcon={<TableChart />}
                  onClick={() => handleDownloadTemplate('rtsp')}
                  sx={{ borderColor: '#8b5cf6', color: '#8b5cf6', '&:hover': { bgcolor: '#f5f3ff' } }}>
                  RTSP Template
                </Button>
              </Tooltip>
              <Divider orientation="vertical" flexItem />
            </>
          )}

          <Tooltip title="Refresh">
            <IconButton onClick={loadCameras} disabled={!selectedExam}
              sx={{ bgcolor: '#f1f5f9', '&:hover': { bgcolor: '#e2e8f0' } }}>
              <Refresh />
            </IconButton>
          </Tooltip>

          <Button variant="outlined" startIcon={<CloudUpload />}
            onClick={() => { setOpenUpload(true); setUploadError(''); }}
            disabled={!selectedExam}>
            Upload Excel
          </Button>

          <Button variant="contained" startIcon={<Add />}
            onClick={() => handleOpenDialog()} disabled={!selectedExam}>
            Add Camera
          </Button>
        </Stack>
      </Box>

      {/* ── Exam selector ─────────────────────────────────────── */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <TextField select label="Select Exam" value={selectedExam}
          onChange={(e) => { setSelectedExam(e.target.value); setPage(0); }} fullWidth size="small">
          <MenuItem value="">— Select an exam —</MenuItem>
          {exams.map((exam) => (
            <MenuItem key={exam.id} value={exam.id}>
              {exam.exam_name} ({exam.exam_body})
              <Chip label={exam.link_type} size="small" sx={{ ml: 1, fontSize: '0.65rem' }}
                color={exam.link_type === 'HLS' ? 'info' : 'secondary'} />
            </MenuItem>
          ))}
        </TextField>
      </Paper>

      {uploadResult && (
        <Alert severity="success" sx={{ mb: 2 }} onClose={() => setUploadResult(null)}>
          {uploadResult.message}
        </Alert>
      )}

      {/* ── Table ─────────────────────────────────────────────── */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}><CircularProgress /></Box>
      ) : cameras.length > 0 ? (
        <>
          <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: '#f8fafc' }}>
                <TableRow>
                  {isHLS ? (
                    <>
                      <TableCell><strong>Centre Name</strong></TableCell>
                      <TableCell><strong>TC Code</strong></TableCell>
                      <TableCell><strong>City</strong></TableCell>
                      <TableCell><strong>State</strong></TableCell>
                      <TableCell><strong>Camera / Lab</strong></TableCell>
                      <TableCell><strong>Ch Code</strong></TableCell>
                      <TableCell><strong>Category</strong></TableCell>
                      <TableCell><strong>Exam Date</strong></TableCell>
                      <TableCell><strong>Shift</strong></TableCell>
                    </>
                  ) : (
                    <>
                      <TableCell><strong>TC Name</strong></TableCell>
                      <TableCell><strong>TC Code</strong></TableCell>
                      <TableCell><strong>Camera Name</strong></TableCell>
                      <TableCell><strong>City</strong></TableCell>
                      <TableCell><strong>State</strong></TableCell>
                      <TableCell><strong>Category</strong></TableCell>
                    </>
                  )}
                  <TableCell><strong>CCTV URL</strong></TableCell>
                  <TableCell align="right"><strong>Actions</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {cameras.map((cam) => (
                  <TableRow key={cam.id} hover>
                    {isHLS ? (
                      <>
                        <TableCell>{cam.centre_name || '-'}</TableCell>
                        <TableCell>{cam.tc_code || '-'}</TableCell>
                        <TableCell>{cam.city || '-'}</TableCell>
                        <TableCell>{cam.state || '-'}</TableCell>
                        <TableCell>{cam.camera_name || '-'}</TableCell>
                        <TableCell>
                          {cam.ch_code
                            ? <Chip label={cam.ch_code} size="small" variant="outlined" />
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Chip label={cam.camera_category || 'N/A'} size="small" />
                        </TableCell>
                        <TableCell>{cam.exam_date || '-'}</TableCell>
                        <TableCell>
                          {cam.shift_id
                            ? (shifts.find((s) => s.id === cam.shift_id)?.shift_name || `#${cam.shift_id}`)
                            : <Chip label="All shifts" size="small" color="default" variant="outlined" />}
                        </TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell>{cam.tc_name || '-'}</TableCell>
                        <TableCell>{cam.tc_code || '-'}</TableCell>
                        <TableCell>{cam.camera_name || '-'}</TableCell>
                        <TableCell>{cam.city || '-'}</TableCell>
                        <TableCell>{cam.state || '-'}</TableCell>
                        <TableCell>
                          <Chip label={cam.camera_category || 'N/A'} size="small" />
                        </TableCell>
                      </>
                    )}
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Tooltip title={cam.cctv_url || cam.url}>
                        <Typography variant="caption" sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                          {truncate(cam.cctv_url || cam.url, 45)}
                        </Typography>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="right">
                      <IconButton size="small" onClick={() => handleOpenDialog(cam)}>
                        <Edit fontSize="small" />
                      </IconButton>
                      <IconButton size="small" color="error" onClick={() => handleDelete(cam.id)}>
                        <Delete fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <TablePagination
            component="div"
            count={totalCount}
            page={page}
            onPageChange={(e, newPage) => setPage(newPage)}
            rowsPerPage={rowsPerPage}
            onRowsPerPageChange={(e) => {
              setRowsPerPage(parseInt(e.target.value, 10));
              setPage(0);
            }}
            rowsPerPageOptions={[10, 25, 50, 100, 200, 500]}
          />
        </>
      ) : (
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography color="text.secondary">
            {selectedExam ? 'No cameras found. Upload an Excel or add manually.' : 'Select an exam to view cameras.'}
          </Typography>
        </Paper>
      )}

      {/* ── Create / Edit Dialog ──────────────────────────────── */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingCamera ? 'Edit Camera' : 'Add Camera'}</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

          {isHLS ? (
            <>
              <TextField fullWidth label="Centre Name" name="centre_name"
                value={formData.centre_name || ''} onChange={(e) => setFormData({ ...formData, centre_name: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="TC Code" name="tc_code"
                value={formData.tc_code || ''} onChange={(e) => setFormData({ ...formData, tc_code: e.target.value })}
                margin="dense" size="small" />
              <Box display="flex" gap={1}>
                <TextField fullWidth label="City" name="city"
                  value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  margin="dense" size="small" />
                <TextField fullWidth label="State" name="state"
                  value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  margin="dense" size="small" />
              </Box>
              <TextField fullWidth label="Camera / Lab Name" name="camera_name"
                value={formData.camera_name || ''} onChange={(e) => setFormData({ ...formData, camera_name: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="Ch Code (Unique channel key)" name="ch_code"
                value={formData.ch_code || ''} onChange={(e) => setFormData({ ...formData, ch_code: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="CCTV URL" name="cctv_url"
                value={formData.cctv_url || ''} onChange={(e) => setFormData({ ...formData, cctv_url: e.target.value })}
                margin="dense" size="small" required />
              <TextField fullWidth label="Camera Category" name="camera_category"
                value={formData.camera_category || ''} onChange={(e) => setFormData({ ...formData, camera_category: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="Classification" name="classification"
                value={formData.classification || ''} onChange={(e) => setFormData({ ...formData, classification: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="Exam Date" name="exam_date" type="date"
                value={formData.exam_date || ''} onChange={(e) => setFormData({ ...formData, exam_date: e.target.value })}
                margin="dense" size="small" InputLabelProps={{ shrink: true }} />
              <TextField select fullWidth label="Shift (leave blank = all shifts)" name="shift_id"
                value={formData.shift_id || ''} onChange={(e) => setFormData({ ...formData, shift_id: e.target.value })}
                margin="dense" size="small">
                <MenuItem value="">All shifts</MenuItem>
                {shifts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>
                ))}
              </TextField>
            </>
          ) : (
            <>
              <TextField fullWidth label="TC Name" name="tc_name"
                value={formData.tc_name || ''} onChange={(e) => setFormData({ ...formData, tc_name: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="TC Code" name="tc_code"
                value={formData.tc_code || ''} onChange={(e) => setFormData({ ...formData, tc_code: e.target.value })}
                margin="dense" size="small" />
              <TextField fullWidth label="Camera Name" name="camera_name"
                value={formData.camera_name || ''} onChange={(e) => setFormData({ ...formData, camera_name: e.target.value })}
                margin="dense" size="small" />
              <Box display="flex" gap={1}>
                <TextField fullWidth label="City" name="city"
                  value={formData.city || ''} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  margin="dense" size="small" />
                <TextField fullWidth label="State" name="state"
                  value={formData.state || ''} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  margin="dense" size="small" />
              </Box>
              <TextField fullWidth label="Stream URL (rtsp://...)" name="url"
                value={formData.url || ''} onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                margin="dense" size="small" required />
              <TextField fullWidth label="Camera Category" name="camera_category"
                value={formData.camera_category || ''} onChange={(e) => setFormData({ ...formData, camera_category: e.target.value })}
                margin="dense" size="small" />
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>Cancel</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingCamera ? 'Save Changes' : 'Add Camera'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Upload Dialog ─────────────────────────────────────── */}
      <Dialog open={openUpload} onClose={() => setOpenUpload(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CloudUpload /> Upload Camera Links Excel
        </DialogTitle>
        <DialogContent>
          {uploadError && <Alert severity="error" sx={{ mb: 2 }}>{uploadError}</Alert>}

          <Alert severity="info" sx={{ mb: 2 }}>
            {isHLS
              ? 'Expected HLS columns: TC Code, Centre Name, City, State, Camera Name, ch_no, CCTV URL, Camera Category'
              : 'Expected RTSP columns: TC Code, TC Name, City, State, Camera Name, URL, Camera Category'}
            <br />
            <strong>Download the template below to get the exact format.</strong>
          </Alert>

          {/* File picker */}
          <Button variant="outlined" component="label" fullWidth startIcon={<Upload />} sx={{ mb: 2 }}>
            {uploadFile ? uploadFile.name : 'Choose Excel File (.xlsx / .xls)'}
            <input type="file" hidden accept=".xlsx,.xls" onChange={(e) => { setUploadFile(e.target.files[0]); setUploadError(''); }} />
          </Button>

          {/* HLS-only options */}
          {isHLS && (
            <Box display="flex" gap={2} mt={1}>
              <TextField select fullWidth label="Shift (optional — blank = all shifts)"
                value={uploadShiftId} onChange={(e) => setUploadShiftId(e.target.value)} size="small">
                <MenuItem value="">All shifts</MenuItem>
                {shifts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>
                ))}
              </TextField>
              <TextField fullWidth label="Exam Date (optional)" type="date" size="small"
                value={uploadDate} onChange={(e) => setUploadDate(e.target.value)}
                InputLabelProps={{ shrink: true }} />
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: 'space-between', px: 3, pb: 2 }}>
          <Box display="flex" gap={1}>
            <Tooltip title="Download blank HLS template">
              <Button size="small" startIcon={<Download />} onClick={() => handleDownloadTemplate('hls')}
                sx={{ color: '#06b6d4' }}>
                HLS Template
              </Button>
            </Tooltip>
            <Tooltip title="Download blank RTSP template">
              <Button size="small" startIcon={<Download />} onClick={() => handleDownloadTemplate('rtsp')}
                sx={{ color: '#8b5cf6' }}>
                RTSP Template
              </Button>
            </Tooltip>
          </Box>
          <Box display="flex" gap={1}>
            <Button onClick={() => setOpenUpload(false)}>Cancel</Button>
            <Button variant="contained" onClick={handleUpload}
              disabled={!uploadFile || uploading}
              startIcon={uploading ? <CircularProgress size={16} /> : <CloudUpload />}>
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>
          </Box>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Cameras;

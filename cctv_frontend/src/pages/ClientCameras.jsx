import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  IconButton,
  Button,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  Search,
  Download,
} from '@mui/icons-material';
import { useSearchParams } from 'react-router-dom';
import { examsAPI, camerasAPI, clientDashboardAPI } from '../services/api';
import ExamSidebar from '../components/ExamSidebar';
import CameraAltIcon from '@mui/icons-material/CameraAlt';

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
  const [camRowsPerPage, setCamRowsPerPage] = useState(50);
  const [camTotal, setCamTotal] = useState(0);
  const [camFilterShiftId, setCamFilterShiftId] = useState('');
  const [camFilterExamDate, setCamFilterExamDate] = useState('');

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
      if (camDebouncedSearch.trim()) params.search = camDebouncedSearch.trim();
      const res = await camerasAPI.getByExam(selectedCamExamId, params);
      setCameras(res.data.data || []);
      setCamTotal(res.data.totalCount || (res.data.data || []).length);
      setCamExamLinkType(res.data.linkType);
      setCamStatusCounts(res.data.statusCounts || { accessible: 0, notAccessible: 0, unknown: 0 });
    } catch (e) { console.error(e); }
    finally { setCamLoading(false); }
  }, [selectedCamExamId, camPage, camRowsPerPage, camFilterShiftId, camFilterExamDate, camDebouncedSearch]);

  useEffect(() => {
    if (selectedCamExamId) loadCameras();
    else { setCameras([]); setCamTotal(0); }
    setCamFilterShiftId('');
    setCamFilterExamDate('');
    setCamSearchQuery('');
    setCamDebouncedSearch('');
    setCamPage(0);
  }, [selectedCamExamId]);

  useEffect(() => {
    if (selectedCamExamId) loadCameras();
  }, [camPage, camRowsPerPage, camFilterShiftId, camFilterExamDate, camDebouncedSearch]);

  const selectedCamExamData = camExams.find(e => String(e.id) === String(selectedCamExamId));
  const isHLS = camExamLinkType === 'HLS' || selectedCamExamData?.link_type?.toUpperCase() === 'HLS';
  const camShifts = selectedCamExamData?.examShifts || [];

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

  const handleDownloadAccessibility = async (type) => {
    if (!selectedCamExamId) return;
    try { await clientDashboardAPI.downloadCameraAccessibility({ exam_id: selectedCamExamId, type }); }
    catch (e) { console.error('Failed to download camera accessibility', e); }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc', borderRadius: 2, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
      <ExamSidebar
        open={camSidebarOpen}
        onToggle={() => setCamSidebarOpen(!camSidebarOpen)}
        exams={camExams}
        selectedExamId={selectedCamExamId}
        onSelectExam={(id) => setSelectedCamExamId(id)}
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
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b' }}>{camTotal} camera{camTotal !== 1 ? 's' : ''} • {isHLS ? 'HLS streams' : 'RTSP streams'}</Typography>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', flexShrink: 0, width: { xs: '100%', md: 'auto' } }}>
                <TextField
                  size="small" placeholder="Search center, state..." value={camSearchQuery} onChange={(e) => setCamSearchQuery(e.target.value)}
                  InputProps={{ startAdornment: <InputAdornment position="start"><Search sx={{ fontSize: 18, color: '#94a3b8' }} /></InputAdornment>, endAdornment: camSearchQuery !== camDebouncedSearch ? <InputAdornment position="end"><CircularProgress size={16} sx={{ color: '#94a3b8' }} /></InputAdornment> : null, sx: { borderRadius: '8px', bgcolor: '#f8fafc', height: 40, fontSize: 14, '& fieldset': { border: '1px solid #e2e8f0' } } }}
                  sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: '100%', sm: 300 } }}
                />
                {isHLS && (
                  <>
                    <FormControl size="small" sx={{ flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, minWidth: { sm: 130 } }}>
                      <Select value={camFilterShiftId} onChange={(e) => { setCamFilterShiftId(e.target.value); setCamPage(0); }} displayEmpty sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#f1f5f9', height: 40, '& fieldset': { border: '1px solid #e2e8f0' } }} renderValue={(v) => v ? camShifts.find(s => s.id === v)?.shift_name || v : 'All shifts'}>
                        <MenuItem value="">All shifts</MenuItem>
                        {camShifts.map(s => <MenuItem key={s.id} value={s.id}>{s.shift_name}</MenuItem>)}
                      </Select>
                    </FormControl>
                    <Box sx={{ position: 'relative', flex: { xs: '1 1 calc(50% - 6px)', sm: '0 0 auto' }, minWidth: { sm: 150 } }}>
                      <TextField type="date" size="small" value={camFilterExamDate ? camFilterExamDate.split('-').reverse().join('-') : ''} onChange={(e) => { const val = e.target.value; if (val) { const [y, m, d] = val.split('-'); setCamFilterExamDate(`${d}-${m}-${y}`); } else setCamFilterExamDate(''); setCamPage(0); }} InputProps={{ sx: { borderRadius: '8px', bgcolor: '#f1f5f9', height: 40, fontSize: 14, color: camFilterExamDate ? 'transparent' : '#94a3b8', paddingRight: '6px', '& fieldset': { border: '1px solid #e2e8f0' } } }} sx={{ width: '100%' }} />
                      {camFilterExamDate && <Box sx={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: '#334155', pointerEvents: 'none' }}>{camFilterExamDate}</Box>}
                    </Box>
                  </>
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

            {cameras.length > 0 && cameras.some(cam => cam.status !== null && cam.status !== undefined) && (
              <Box sx={{ display: 'flex', gap: 2, mb: 2, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' } }}>
                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleDownloadAccessibility('accessible')}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }, height: 32, px: 2, borderRadius: 2, borderColor: '#3b82f6', color: '#3b82f6', textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#eff6ff' } }}
                >
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mr: 1, whiteSpace: 'nowrap' }}>Accessible</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{camStatusCounts.accessible}</Typography>
                </Button>

                <Button
                  variant="outlined"
                  size="small"
                  onClick={() => handleDownloadAccessibility('not_accessible')}
                  startIcon={<Download sx={{ fontSize: 16 }} />}
                  sx={{ flex: { xs: '1 1 calc(50% - 8px)', sm: '0 0 auto' }, height: 32, px: 2, borderRadius: 2, borderColor: '#333', color: '#333', textTransform: 'none', whiteSpace: 'nowrap', '&:hover': { bgcolor: '#f3f4f6' } }}
                >
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 600, mr: 1, whiteSpace: 'nowrap' }}>Not Accessible</Typography>
                  <Typography sx={{ fontSize: '0.75rem', fontWeight: 700 }}>{camStatusCounts.notAccessible}</Typography>
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
                                  {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </TableSortLabel>
                              </TableCell>
                            ))}
                          </>
                        ) : (
                          <>
                            {['device_id', 'camera_no', 'tc_code', 'camera_name', 'centre_name', 'state', 'classification', 'status'].map((col) => (
                              <TableCell key={col} sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>
                                <TableSortLabel active={camOrderBy === col} direction={camOrderBy === col ? camOrder : 'asc'} onClick={() => handleCamSort(col)}>
                                  {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </TableSortLabel>
                              </TableCell>
                            ))}
                          </>
                        )}
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
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.classification || '-'}</TableCell>
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
                              <TableCell sx={{ fontSize: '0.85rem' }}>{cam.classification || '-'}</TableCell>
                              <TableCell>
                                <Chip
                                  size="small"
                                  {...getStatusChipProps(cam.status)}
                                  sx={{ fontWeight: 600, fontSize: '0.72rem', ...getStatusChipProps(cam.status).sx }}
                                />
                              </TableCell>
                            </>
                          )}
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
                <TablePagination component="div" count={camTotal} page={camPage} onPageChange={(e, newPage) => setCamPage(newPage)} rowsPerPage={camRowsPerPage} onRowsPerPageChange={(e) => { setCamRowsPerPage(parseInt(e.target.value, 10)); setCamPage(0); }} rowsPerPageOptions={[10, 25, 50, 100, 200]}
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
    </Box>
  );
};

export default ClientCameras;

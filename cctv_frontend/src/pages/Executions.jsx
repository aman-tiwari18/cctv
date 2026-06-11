import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Chip, CircularProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Tooltip, Alert, Snackbar, FormControl, InputLabel,
  Select, MenuItem, TextField, InputAdornment, TableSortLabel,
} from '@mui/material';
import {
  Visibility, Refresh, Stop, FiberManualRecord,
  PlayCircle as PlayCircleIcon, Slideshow, Search
} from '@mui/icons-material';
import { format } from 'date-fns';
import { executionsAPI, examsAPI } from '../services/api';
import ExamSidebar from '../components/ExamSidebar';
import axios from 'axios';

/* ── Status chip colour map ────────────────────────────────── */
const STATUS_COLORS = {
  SCHEDULED: { bg: '#ede9fe', color: '#6d28d9' },
  PENDING: { bg: '#fef3c7', color: '#92400e' },
  RUNNING: { bg: '#dcfce7', color: '#15803d' },
  COMPLETED: { bg: '#dbeafe', color: '#1e40af' },
  FAILED: { bg: '#fee2e2', color: '#b91c1c' },
  CANCELLED: { bg: '#f1f5f9', color: '#64748b' },
};

const STATUS_OPTIONS = ['ALL', 'SCHEDULED', 'PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED'];

function StatusChip({ status }) {
  const c = STATUS_COLORS[status] || STATUS_COLORS.CANCELLED;
  return (
    <Chip
      label={status}
      size="small"
      sx={{ bgcolor: c.bg, color: c.color, fontWeight: 700, fontSize: '0.7rem', border: 'none', height: 22 }}
    />
  );
}

function PulsingDot() {
  return (
    <Box component="span" sx={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      bgcolor: '#22c55e', mr: 0.8,
      animation: 'pulse 1.4s ease-in-out infinite',
      '@keyframes pulse': {
        '0%, 100%': { opacity: 1, transform: 'scale(1)' },
        '50%': { opacity: 0.4, transform: 'scale(0.7)' },
      },
    }} />
  );
}

const formatDateLabel = (v) => {
  if (!v) return 'No date';
  const p = String(v).split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : v;
};

const Executions = () => {
  const [searchParams] = useSearchParams();
  const urlExamId = searchParams.get('exam');

  /* ── Sidebar state ── */
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(urlExamId || '');
  const [viewingArchived, setViewingArchived] = useState(false);

  /* ── Execution data ── */
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ── Search & Sort ── */
  const [searchQuery, setSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('');
  const [order, setOrder] = useState('desc');

  /* ── Filters (right-panel, far right) ── */
  const [selectedDate, setSelectedDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  /* ── Dialogs / feedback ── */
  const [selectedExecution, setSelectedExecution] = useState(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  const pollRef = useRef(null);

  /* ════ Load exams ════ */
  useEffect(() => { loadExams(); }, [viewingArchived]);

  const loadExams = async () => {
    try {
      const res = await examsAPI.getAll({ is_active: !viewingArchived });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setExams(list);
      if (urlExamId && list.length > 0 && !viewingArchived) setSelectedExamId(urlExamId);
    } catch (e) { console.error('loadExams:', e); }
  };

  /* ════ Load executions for selected exam ════ */
  const loadExecutions = useCallback(async () => {
    if (!selectedExamId) { setExecutions([]); return; }
    setLoading(true);
    try {
      const params = { limit: 200, exam_id: selectedExamId };
      
      // Add date filter if selected
      if (selectedDate) {
        params.assignment_date = selectedDate;
      }
      
      // Add status filter if not 'ALL'
      if (statusFilter && statusFilter !== 'ALL') {
        params.status = statusFilter;
      }
      
      const res = await executionsAPI.getAll(params);
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setExecutions(list);
    } catch (e) {
      console.error('loadExecutions:', e);
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [selectedExamId, selectedDate, statusFilter]);

  useEffect(() => { 
    // When exam changes, fetch all executions first to get available dates
    const fetchInitialData = async () => {
      if (!selectedExamId) { 
        setExecutions([]); 
        setSelectedDate(''); 
        setStatusFilter('ALL'); 
        return; 
      }
      
      setLoading(true);
      try {
        // Fetch all executions for this exam to get available dates
        const res = await executionsAPI.getAll({ limit: 200, exam_id: selectedExamId });
        const list = Array.isArray(res?.data?.data) ? res.data.data : [];
        
        // Get unique dates from executions
        const dates = [...new Set(list.map((e) => e.assignment_date).filter(Boolean))].sort((a, b) => new Date(b) - new Date(a));
        
        // Local-date YYYY-MM-DD. toISOString() returns UTC, which after IST
        // midnight resolves to the previous day and made yesterday auto-select.
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));

        // Prefer today whenever it falls inside the exam window — scripts
        // trigger throughout the day, so executions may not exist yet at page
        // load; the user still expects today's view.
        const todayInRange =
          !selectedExam?.start_date || !selectedExam?.end_date
            ? true
            : new Date(today) >= new Date(selectedExam.start_date) &&
              new Date(today) <= new Date(selectedExam.end_date);

        if (todayInRange) {
          setSelectedDate(today);
        } else if (dates.length > 0) {
          setSelectedDate(dates[0]);
        } else {
          setSelectedDate('');
        }
        
        setStatusFilter('ALL');
      } catch (e) {
        console.error('fetchInitialData:', e);
        setExecutions([]);
        setSelectedDate('');
        setStatusFilter('ALL');
      } finally {
        setLoading(false);
      }
    };
    
    fetchInitialData();
  }, [selectedExamId, exams]);

  /* Reload executions when date or status filter changes */
  useEffect(() => {
    if (selectedDate || statusFilter !== 'ALL') {
      loadExecutions();
    }
  }, [selectedDate, statusFilter, loadExecutions]);

  /* Vision RUNNING assignments older than 2h are displayed as COMPLETED */
  const isStaleVisionRunning = (ex) => {
    if (ex.status !== 'RUNNING') return false;
    if (!['vision', 'vision_neet'].includes(ex.script?.script_id)) return false;
    if (!ex.started_at) return false;
    return (Date.now() - new Date(ex.started_at).getTime()) > 2 * 60 * 60 * 1000;
  };

  /* Auto-refresh every 10 s when RUNNING (excluding stale vision) */
  useEffect(() => {
    const hasRunning = executions.some((e) => e.status === 'RUNNING' && !isStaleVisionRunning(e));
    if (hasRunning) pollRef.current = setInterval(loadExecutions, 10_000);
    else clearInterval(pollRef.current);
    return () => clearInterval(pollRef.current);
  }, [executions, loadExecutions]);

  /* ── Derive available dates from loaded executions ── */
  const availableDates = useMemo(() => {
    const set = new Set(executions.map((e) => e.assignment_date).filter(Boolean));
    // Always include today if it falls inside the selected exam window so the
    // dropdown surfaces it even before any executions have triggered today.
    const exam = exams.find((e) => String(e.id) === String(selectedExamId));
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const todayInRange =
      !exam?.start_date || !exam?.end_date
        ? !!selectedExamId
        : new Date(today) >= new Date(exam.start_date) &&
          new Date(today) <= new Date(exam.end_date);
    if (todayInRange) set.add(today);
    return [...set].sort((a, b) => new Date(b) - new Date(a));
  }, [executions, exams, selectedExamId]);

  /* ── Filter rows (only search filter now, date and status are backend-filtered) ── */
  const visibleRows = useMemo(() => {
    let filtered = executions;

    // Search filter (client-side for better UX)
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((e) => {
        const haystack = [
          e.script?.name,
          e.shift?.shift_name,
          e.status,
          String(e.id),
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(q);
      });
    }

    // Apply sorting
    if (orderBy) {
      filtered.sort((a, b) => {
        let aVal = a[orderBy];
        let bVal = b[orderBy];

        // Handle nested properties
        if (orderBy === 'script_name') {
          aVal = a.script?.name || '';
          bVal = b.script?.name || '';
        } else if (orderBy === 'shift_name') {
          aVal = a.shift?.shift_name || '';
          bVal = b.shift?.shift_name || '';
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
      });
    }

    return filtered;
  }, [executions, searchQuery, orderBy, order]);

  const handleRequestSort = (property) => {
    const isAsc = orderBy === property && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(property);
  };

  const runningCount = executions.filter((e) => e.status === 'RUNNING' && !isStaleVisionRunning(e)).length;
  const selectedExam = exams.find((e) => String(e.id) === String(selectedExamId));

  /* ── Handlers ── */
  const handleViewDetails = async (ex) => {
    try {
      const res = await executionsAPI.getById(ex.id);
      setSelectedExecution(res.data.data);
    } catch { setSelectedExecution(ex); }
    setOpenDialog(true);
  };

  const handleStopClick = (ex) => setCancelTarget(ex);
  const handleCancelAbort = () => setCancelTarget(null);

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await axios.post(`/ss/executions/${cancelTarget.id}/cancel`);
      setSnack({ open: true, msg: `Script "${cancelTarget.script?.name || cancelTarget.id}" stopped.`, severity: 'success' });
      setCancelTarget(null);
      loadExecutions();
    } catch (err) {
      setSnack({ open: true, msg: `Failed to stop: ${err.response?.data?.detail || err.message}`, severity: 'error' });
    } finally { setCancelling(false); }
  };

  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc' }}>

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
              <Slideshow sx={{ fontSize: 40, color: '#3b82f6' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to view executions</Typography>
            <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>
              Choose an exam from the sidebar to view script execution history.
            </Typography>
          </Box>
        ) : (
          <>
            {/* ── Title row ── */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3.5, flexWrap: 'wrap', gap: 2 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: { xs: '1.15rem', sm: '1.5rem' } }}>
                    {selectedExam ? `${selectedExam.exam_name} (${selectedExam.exam_body})` : 'Exam'}
                  </Typography>
                  {selectedExam && selectedExam.is_active === false && (
                    <Chip label="Archived" size="small" color="error" variant="filled" sx={{ fontWeight: 600, height: 24, fontSize: '0.7rem' }} />
                  )}
                  {runningCount > 0 && (
                    <Chip
                      icon={<FiberManualRecord sx={{ fontSize: '10px !important', color: '#22c55e !important' }} />}
                      label={`${runningCount} running`}
                      size="small"
                      sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}
                    />
                  )}
                </Box>
                <Typography sx={{ fontSize: '0.9rem', color: '#64748b', mt: 0.5 }}>
                  Script execution history for {selectedExam?.exam_name || 'this exam'}.
                  {runningCount > 0 && ' · Auto-refreshing every 10s'}
                </Typography>
              </Box>

              {/* Far-right: Search + Date + Status filters */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0, flexWrap: 'wrap', width: { xs: '100%', md: 'auto' } }}>
                {/* Search */}
                <TextField
                  size="small"
                  placeholder="Search script, shift..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <Search sx={{ fontSize: 18, color: '#94a3b8' }} />
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
                  sx={{ flex: { xs: '1 1 100%', sm: '0 0 auto' }, minWidth: { xs: '100%', sm: 260 }, maxWidth: { xs: 'none', sm: 300 } }}
                />

                {availableDates.length > 0 && (
                  <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 165 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
                    <InputLabel id="exec-date-label">Execution Date</InputLabel>
                    <Select
                      labelId="exec-date-label"
                      value={selectedDate}
                      label="Execution Date"
                      onChange={(e) => setSelectedDate(e.target.value)}
                      sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#fff', height: 40 }}
                    >
                      {availableDates.map((d) => (
                        <MenuItem key={d} value={d}>{formatDateLabel(d)}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <FormControl size="small" sx={{ minWidth: { xs: '100%', sm: 140 }, flex: { xs: '1 1 100%', sm: '0 0 auto' } }}>
                  <InputLabel id="exec-status-label">Status</InputLabel>
                  <Select
                    labelId="exec-status-label"
                    value={statusFilter}
                    label="Status"
                    onChange={(e) => setStatusFilter(e.target.value)}
                    sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#fff', height: 40 }}
                  >
                    {STATUS_OPTIONS.map((s) => <MenuItem key={s} value={s}>{s === 'ALL' ? 'ALL' : s}</MenuItem>)}
                  </Select>
                </FormControl>

              </Box>
            </Box>

            {/* ── Table ── */}
            {loading ? (
              <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : visibleRows.length > 0 ? (
              <TableContainer component={Paper} sx={{ borderRadius: 2.5, border: '1px solid #e8ecf1', boxShadow: 'none' }}>
                <Table>
                  <TableHead sx={{ bgcolor: '#f8fafc' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 80 }}>
                        <TableSortLabel
                          active={orderBy === 'id'}
                          direction={orderBy === 'id' ? order : 'asc'}
                          onClick={() => handleRequestSort('id')}
                        >
                          ID
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 150 }}>
                        <TableSortLabel
                          active={orderBy === 'script_name'}
                          direction={orderBy === 'script_name' ? order : 'asc'}
                          onClick={() => handleRequestSort('script_name')}
                        >
                          Script
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                        <TableSortLabel
                          active={orderBy === 'shift_name'}
                          direction={orderBy === 'shift_name' ? order : 'asc'}
                          onClick={() => handleRequestSort('shift_name')}
                        >
                          Shift
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 120 }}>
                        <TableSortLabel
                          active={orderBy === 'status'}
                          direction={orderBy === 'status' ? order : 'asc'}
                          onClick={() => handleRequestSort('status')}
                        >
                          Status
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 150 }}>
                        <TableSortLabel
                          active={orderBy === 'started_at'}
                          direction={orderBy === 'started_at' ? order : 'asc'}
                          onClick={() => handleRequestSort('started_at')}
                        >
                          Started At
                        </TableSortLabel>
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 150 }}>
                        <TableSortLabel
                          active={orderBy === 'completed_at'}
                          direction={orderBy === 'completed_at' ? order : 'asc'}
                          onClick={() => handleRequestSort('completed_at')}
                        >
                          Completed At
                        </TableSortLabel>
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b', minWidth: 100 }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map((ex) => {
                      const effectiveStatus = isStaleVisionRunning(ex) ? 'COMPLETED' : ex.status;
                      return (
                      <TableRow
                        key={ex.id}
                        sx={{
                          bgcolor: effectiveStatus === 'RUNNING' ? '#f0fdf4' : 'inherit',
                          '&:hover': { bgcolor: effectiveStatus === 'RUNNING' ? '#dcfce7' : '#f8fafc' },
                          transition: 'background 0.15s',
                        }}
                      >
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>#{ex.id}</TableCell>
                        <TableCell sx={{ fontSize: '0.88rem' }}>{ex.script?.name || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.88rem' }}>{ex.shift?.shift_name || '-'}</TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            {effectiveStatus === 'RUNNING' && <PulsingDot />}
                            <StatusChip status={effectiveStatus} />
                          </Box>
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.85rem', color: '#475569' }}>
                          {ex.started_at ? format(new Date(ex.started_at), 'dd MMM, HH:mm') : '-'}
                        </TableCell>
                        <TableCell sx={{ fontSize: '0.85rem', color: '#475569' }}>
                          {ex.completed_at ? format(new Date(ex.completed_at), 'dd MMM, HH:mm') : '-'}
                        </TableCell>
                        <TableCell align="right">
                          <Box display="flex" gap={0.5} justifyContent="flex-end">
                            {effectiveStatus === 'RUNNING' && (
                              <Tooltip title="Stop this script">
                                <IconButton size="small" onClick={() => handleStopClick(ex)}
                                  sx={{ color: '#ef4444', bgcolor: '#fee2e2', '&:hover': { bgcolor: '#fca5a5' }, borderRadius: 1.5 }}>
                                  <Stop fontSize="small" />
                                </IconButton>
                              </Tooltip>
                            )}
                            <Tooltip title="View details">
                              <IconButton size="small" onClick={() => handleViewDetails(ex)}>
                                <Visibility fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          </Box>
                        </TableCell>
                      </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Box sx={{ textAlign: 'center', py: 8, bgcolor: '#fff', borderRadius: 3, border: '1px solid #e8ecf1' }}>
                <Typography sx={{ fontSize: '0.95rem', color: '#64748b' }}>
                  {executions.length === 0
                    ? 'No executions found for this exam.'
                    : `No executions match the selected filters.`}
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* ── Cancel Confirmation Dialog ── */}
      <Dialog open={!!cancelTarget} onClose={handleCancelAbort} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: '#dc2626', fontWeight: 700 }}>⏹ Stop Script?</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>This will immediately terminate the running script process.</Alert>
          <Typography variant="body2">
            Assignment <strong>#{cancelTarget?.id}</strong> — <strong>{cancelTarget?.script?.name}</strong> will be marked as <Chip label="CANCELLED" size="small" /> in the database.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancelAbort} disabled={cancelling}>Keep Running</Button>
          <Button variant="contained" color="error" onClick={handleCancelConfirm} disabled={cancelling}
            startIcon={cancelling ? <CircularProgress size={16} /> : <Stop />}>
            {cancelling ? 'Stopping…' : 'Stop Script'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Details Dialog ── */}
      <Dialog open={openDialog} onClose={() => { setOpenDialog(false); setSelectedExecution(null); }} maxWidth="md" fullWidth>
        <DialogTitle>Execution Details</DialogTitle>
        <DialogContent>
          {selectedExecution && (
            <Box>
              {[
                ['Status', <StatusChip key="s" status={selectedExecution.status} />],
                ['Script', selectedExecution.script?.name || '-'],
                ['Shift', selectedExecution.shift?.shift_name || '-'],
                selectedExecution.started_at && ['Started At', format(new Date(selectedExecution.started_at), 'MMM dd, yyyy HH:mm:ss')],
                selectedExecution.completed_at && ['Completed At', format(new Date(selectedExecution.completed_at), 'MMM dd, yyyy HH:mm:ss')],
                selectedExecution.started_at && selectedExecution.completed_at && [
                  'Duration',
                  `${Math.round((new Date(selectedExecution.completed_at) - new Date(selectedExecution.started_at)) / 1000)} seconds`,
                ],
              ].filter(Boolean).map(([label, value]) => (
                <Box key={label} mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">{label}</Typography>
                  {React.isValidElement(value)
                    ? value
                    : <Typography variant="body1">{value}</Typography>}
                </Box>
              ))}
              {selectedExecution.error_log && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="error">Error Log</Typography>
                  <Paper sx={{ p: 2, bgcolor: '#ffebee', mt: 1 }}>
                    <Typography variant="body2" color="error">{selectedExecution.error_log}</Typography>
                  </Paper>
                </Box>
              )}
              {selectedExecution.result_data && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">Result Data</Typography>
                  <Paper sx={{ p: 2, bgcolor: '#f8fafc', mt: 1 }}>
                    <pre style={{ margin: 0, fontSize: 12, overflow: 'auto' }}>
                      {JSON.stringify(selectedExecution.result_data, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {selectedExecution?.status === 'RUNNING' && (
            <Button variant="outlined" color="error" startIcon={<Stop />}
              onClick={() => { setOpenDialog(false); handleStopClick(selectedExecution); }}>
              Stop Script
            </Button>
          )}
          <Button onClick={() => { setOpenDialog(false); setSelectedExecution(null); }}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ── */}
      <Snackbar open={snack.open} autoHideDuration={4000}
        onClose={() => setSnack((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}>
        <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Executions;

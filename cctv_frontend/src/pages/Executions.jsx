import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Chip, CircularProgress,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions,
  Button, Tooltip, Alert, Snackbar, FormControl, InputLabel,
  Select, MenuItem,
} from '@mui/material';
import {
  Visibility, Refresh, Stop, FiberManualRecord, ChevronRight,
  PlayCircle as PlayCircleIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { executionsAPI, examsAPI } from '../services/api';
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
  const [exams, setExams] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState(urlExamId || '');
  const [viewingArchived, setViewingArchived] = useState(false);

  /* ── Execution data ── */
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(false);

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
      const res = await executionsAPI.getByExam(selectedExamId, { limit: 200 });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      setExecutions(list);
    } catch (e) {
      console.error('loadExecutions:', e);
      setExecutions([]);
    } finally {
      setLoading(false);
    }
  }, [selectedExamId]);

  useEffect(() => { loadExecutions(); setSelectedDate(''); setStatusFilter('ALL'); }, [selectedExamId]);

  /* Auto-refresh every 10 s when RUNNING */
  useEffect(() => {
    const hasRunning = executions.some((e) => e.status === 'RUNNING');
    if (hasRunning) pollRef.current = setInterval(loadExecutions, 10_000);
    else clearInterval(pollRef.current);
    return () => clearInterval(pollRef.current);
  }, [executions, loadExecutions]);

  /* ── Derive available dates from loaded executions ── */
  const availableDates = [
    ...new Set(executions.map((e) => e.assignment_date).filter(Boolean)),
  ].sort((a, b) => new Date(b) - new Date(a));

  /* Auto-select today or first date when exam changes */
  useEffect(() => {
    if (!availableDates.length) { setSelectedDate(''); return; }
    const today = new Date().toISOString().split('T')[0];
    if (!selectedDate || !availableDates.includes(selectedDate)) {
      setSelectedDate(availableDates.includes(today) ? today : availableDates[0]);
    }
  }, [availableDates.join(',')]);

  /* ── Filter rows ── */
  const visibleRows = executions.filter((e) => {
    const dateOk = !selectedDate || e.assignment_date === selectedDate;
    const statusOk = statusFilter === 'ALL' || e.status === statusFilter;
    return dateOk && statusOk;
  });

  const runningCount = executions.filter((e) => e.status === 'RUNNING').length;
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

  /* ════════════════════════════════════════════════════
     RENDER
  ═════════════════════════════════════════════════════ */
  return (
    <Box sx={{ display: 'flex', minHeight: 'calc(100vh - 120px)', bgcolor: '#f8fafc' }}>

      {/* ════ LEFT SIDEBAR ════ */}
      <Box sx={{
        width: 280, flexShrink: 0, borderRight: '1px solid #e8ecf1',
        bgcolor: '#fff', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Section header */}
        <Box sx={{ px: 2.5, pt: 2.5, pb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <PlayCircleIcon sx={{ fontSize: 18, color: '#64748b' }} />
            <Typography sx={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#334155' }}>
              {viewingArchived ? 'Archived Exams' : 'Available Exams'}
            </Typography>
          </Box>
        </Box>

        {/* Exam list */}
        <Box sx={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'none', '&::-webkit-scrollbar': { display: 'none' } }}>
          {exams.map((exam) => {
            const active = String(exam.id) === String(selectedExamId);
            return (
              <Box
                key={exam.id}
                onClick={() => setSelectedExamId(exam.id)}
                sx={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  px: 2.5, py: 1.8, cursor: 'pointer',
                  borderLeft: active ? '3px solid #3b82f6' : '3px solid transparent',
                  bgcolor: active ? '#f0f6ff' : 'transparent',
                  transition: 'all 0.15s ease',
                  '&:hover': { bgcolor: active ? '#f0f6ff' : '#f8fafc' },
                }}
              >
                <Typography sx={{ fontSize: '0.88rem', fontWeight: active ? 600 : 400, color: active ? '#3b82f6' : '#334155', lineHeight: 1.4, pr: 1 }}>
                  {exam.exam_name} ({exam.exam_body})
                </Typography>
                <ChevronRight sx={{ fontSize: 20, color: active ? '#3b82f6' : '#94a3b8', flexShrink: 0 }} />
              </Box>
            );
          })}
          {exams.length === 0 && (
            <Typography sx={{ px: 2.5, py: 2, fontSize: '0.82rem', color: '#94a3b8' }}>No exams found.</Typography>
          )}
        </Box>

        {/* Toggle archived */}
        <Box sx={{ px: 2.5, py: 2 }}>
          <Button variant="outlined" fullWidth
            onClick={() => { setViewingArchived(!viewingArchived); setSelectedExamId(''); }}
            sx={{ textTransform: 'uppercase', fontWeight: 500, fontSize: '0.72rem', letterSpacing: '0.04em', borderColor: '#cbd5e1', color: '#777', borderRadius: 2, py: 1, '&:hover': { bgcolor: '#f1f5f9', borderColor: '#94a3b8' } }}
          >
            {viewingArchived ? 'View Active Exams' : 'View Archived Exams'}
          </Button>
        </Box>
      </Box>

      {/* ════ RIGHT PANEL ════ */}
      <Box sx={{ flex: 1, p: 3.5, overflowY: 'auto' }}>
        {!selectedExamId ? (
          /* Empty state */
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 200px)', textAlign: 'center', px: 4 }}>
            <Box sx={{ width: 96, height: 96, borderRadius: '50%', bgcolor: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 3 }}>
              <PlayCircleIcon sx={{ fontSize: 40, color: '#3b82f6' }} />
            </Box>
            <Typography variant="h5" sx={{ fontWeight: 700, color: '#1e293b', mb: 1.5 }}>Select an exam to view executions</Typography>
            <Typography sx={{ fontSize: '0.92rem', color: '#64748b', maxWidth: 420, lineHeight: 1.6 }}>
              Choose an exam from the sidebar to view script execution history.
            </Typography>
          </Box>
        ) : (
          <>
            {/* ── Title row ── */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3.5 }}>
              <Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 0.5 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600, color: '#0f172a', fontSize: '1.5rem' }}>
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

              {/* Far-right: Date + Status filters + Refresh */}
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexShrink: 0 }}>
                {availableDates.length > 0 && (
                  <FormControl size="small" sx={{ minWidth: 165 }}>
                    <InputLabel id="exec-date-label">Execution Date</InputLabel>
                    <Select
                      labelId="exec-date-label"
                      value={selectedDate}
                      label="Execution Date"
                      onChange={(e) => setSelectedDate(e.target.value)}
                      sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#fff' }}
                    >
                      {availableDates.map((d) => (
                        <MenuItem key={d} value={d}>{formatDateLabel(d)}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                <FormControl size="small" sx={{ minWidth: 140 }}>
                  <InputLabel id="exec-status-label">Status</InputLabel>
                  <Select
                    labelId="exec-status-label"
                    value={statusFilter}
                    label="Status"
                    onChange={(e) => setStatusFilter(e.target.value)}
                    sx={{ borderRadius: 2, fontSize: '0.85rem', bgcolor: '#fff' }}
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
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Script</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Shift</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Status</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Started At</TableCell>
                      <TableCell sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Completed At</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.78rem', color: '#64748b' }}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {visibleRows.map((ex) => (
                      <TableRow
                        key={ex.id}
                        sx={{
                          bgcolor: ex.status === 'RUNNING' ? '#f0fdf4' : 'inherit',
                          '&:hover': { bgcolor: ex.status === 'RUNNING' ? '#dcfce7' : '#f8fafc' },
                          transition: 'background 0.15s',
                        }}
                      >
                        <TableCell sx={{ fontWeight: 600, color: '#475569', fontSize: '0.85rem' }}>#{ex.id}</TableCell>
                        <TableCell sx={{ fontSize: '0.88rem' }}>{ex.script?.name || '-'}</TableCell>
                        <TableCell sx={{ fontSize: '0.88rem' }}>{ex.shift?.shift_name || '-'}</TableCell>
                        <TableCell>
                          <Box display="flex" alignItems="center">
                            {ex.status === 'RUNNING' && <PulsingDot />}
                            <StatusChip status={ex.status} />
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
                            {ex.status === 'RUNNING' && (
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
                    ))}
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

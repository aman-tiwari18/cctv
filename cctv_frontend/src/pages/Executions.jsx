import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Typography, Chip, CircularProgress,
  TextField, MenuItem, IconButton, Dialog, DialogTitle,
  DialogContent, DialogActions, Button, Tooltip, Alert,
  Snackbar, Badge, FormControl, InputLabel, Select,
} from '@mui/material';
import {
  Visibility, Refresh, Stop, FiberManualRecord,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { executionsAPI, shiftScriptsAPI } from '../services/api';
import axios from 'axios';

const statusColors = {
  SCHEDULED: 'secondary',
  PENDING:   'warning',
  RUNNING:   'info',
  COMPLETED: 'success',
  FAILED:    'error',
  CANCELLED: 'default',
};

// ─── Live "RUNNING" pulse indicator ──────────────────────────────────────────
function PulsingDot() {
  return (
    <Box
      component="span"
      sx={{
        display: 'inline-block',
        width: 8, height: 8,
        borderRadius: '50%',
        bgcolor: '#22c55e',
        mr: 0.8,
        animation: 'pulse 1.4s ease-in-out infinite',
        '@keyframes pulse': {
          '0%, 100%': { opacity: 1, transform: 'scale(1)' },
          '50%':       { opacity: 0.4, transform: 'scale(0.7)' },
        },
      }}
    />
  );
}

const Executions = () => {
  const [assignments, setAssignments]         = useState([]);
  const [shiftAssignments, setShiftAssignments] = useState([]); // shift script assignments
  const [loading, setLoading]                 = useState(true);
  const [filters, setFilters]                 = useState({ status: 'ALL' });
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [openDialog, setOpenDialog]           = useState(false);
  const [selectedDate, setSelectedDate]       = useState('');

  // Cancel confirmation
  const [cancelTarget, setCancelTarget]       = useState(null); // assignment to cancel
  const [cancelling, setCancelling]           = useState(false);

  // Snackbar feedback
  const [snack, setSnack] = useState({ open: false, msg: '', severity: 'success' });

  const pollRef = useRef(null);

  // ── Get execution date from started_at ──────────────────────────────────────
  const getExecutionDate = (startedAt) => {
    if (!startedAt) return null;
    const date = new Date(startedAt);
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  };

  // ── Format date for display ────────────────────────────────────────────────
  const formatExecutionDate = (value) => {
    if (!value) return 'No date';
    const parts = String(value).split('-');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return value;
  };

  // ── Load all shift script assignments to get full date range ────────────────
  const loadShiftAssignments = useCallback(async (executions) => {
    try {
      // Get unique shifts from executions
      const uniqueShiftIds = [
        ...new Set(executions.map((e) => e.shift?.id).filter(Boolean))
      ];

      if (uniqueShiftIds.length === 0) {
        setShiftAssignments([]);
        return;
      }

      // Load assignments for each shift
      const allAssignments = [];
      for (const shiftId of uniqueShiftIds) {
        try {
          const response = await shiftScriptsAPI.getByShift(shiftId);
          const assignmentList = Array.isArray(response?.data?.data)
            ? response.data.data
            : [];
          allAssignments.push(...assignmentList);
        } catch (error) {
          console.error(`Error loading assignments for shift ${shiftId}:`, error);
        }
      }

      setShiftAssignments(allAssignments);
    } catch (error) {
      console.error('Error loading shift assignments:', error);
      setShiftAssignments([]);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      const response = await executionsAPI.getAll({});
      setAssignments(response.data.data);
      // Load shift assignments to get full date range (independent of status filter)
      if (response.data.data && response.data.data.length > 0) {
        loadShiftAssignments(response.data.data);
      }
    } catch (error) {
      console.error('Error loading assignments:', error);
    } finally {
      setLoading(false);
    }
  }, [loadShiftAssignments]);

  // Initial load + whenever filters change
  useEffect(() => {
    setLoading(true);
    loadAssignments();
  }, [loadAssignments]);

  // ── Set default date to today ──────────────────────────────────────────────
  useEffect(() => {
    if (shiftAssignments.length > 0 && !selectedDate) {
      const availableDates = [
        ...new Set(shiftAssignments.map((a) => a.assignment_date).filter(Boolean))
      ].sort();

      if (availableDates.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        if (availableDates.includes(today)) {
          setSelectedDate(today);
        } else {
          // If today has no assignments, use the first available date
          setSelectedDate(availableDates[0]);
        }
      }
    }
  }, [shiftAssignments, selectedDate]);

  // Auto-refresh every 10 s if any assignment is RUNNING
  useEffect(() => {
    const hasRunning = assignments.some(a => a.status === 'RUNNING');
    if (hasRunning) {
      pollRef.current = setInterval(loadAssignments, 10_000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [assignments, loadAssignments]);
  // ── Calculate available dates and filter assignments ────────────────────────
  const executionDates = [
    ...new Set(
      shiftAssignments
        .map((a) => a.assignment_date)
        .filter(Boolean)
    ),
  ].sort((a, b) => new Date(b) - new Date(a)); // Sort descending (latest first)

  // ── Build display rows for selected date ───────────────────────────────────
  const getScheduledAndExecutedScripts = useCallback(() => {
    if (!selectedDate) return [];

    // Get all scheduled scripts for the selected date
    const scheduledScriptsForDate = shiftAssignments.filter(
      (a) => a.assignment_date === selectedDate && a.is_active
    );

    // Use assignment id as the primary key to avoid false pending/scheduled rows.
    const assignmentMap = new Map();
    assignments.forEach((item) => {
      assignmentMap.set(item.id, item);
    });

    // Get today's date to check if assignment date is in future
    const today = new Date().toISOString().split('T')[0];

    // Merge using assignment status as source of truth for this date.
    const merged = scheduledScriptsForDate.map((assignment) => {
      const source = assignmentMap.get(assignment.id) || assignment;
      const baseStatus = source.status || assignment.status;

      // For future rows, show PENDING as SCHEDULED.
      if (baseStatus === 'PENDING' && assignment.assignment_date > today) {
        return {
          ...source,
          status: 'SCHEDULED',
          assignment_info: assignment,
        };
      }

      // For past rows, hide non-run PENDING scripts.
      if (baseStatus === 'PENDING' && assignment.assignment_date < today) {
        return null;
      }

      // Today keeps PENDING; executed/other statuses stay unchanged.
      return {
        ...source,
        assignment_info: assignment,
      };
    }).filter(item => item !== null); // Remove null entries

    return merged;
  }, [selectedDate, shiftAssignments, assignments]);

  const visibleData = getScheduledAndExecutedScripts();

  const filteredAssignments = visibleData.filter((a) => {
    if (filters.status === 'ALL') return true;
    // Otherwise, filter by the selected status
    return a.status === filters.status;
  });
  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleFilterChange = (e) =>
    setFilters({ ...filters, [e.target.name]: e.target.value });

  const handleDateChange = (e) => setSelectedDate(e.target.value);

  const handleViewDetails = async (assignment) => {
    try {
      // For transformed client-side rows, keep displayed status in details as well.
      if (assignment.assignment_info && assignment.status === 'SCHEDULED') {
        setSelectedAssignment(assignment);
        setOpenDialog(true);
        return;
      }

      const response = await executionsAPI.getById(assignment.id);
      setSelectedAssignment(response.data.data);
      setOpenDialog(true);
    } catch (error) {
      console.error('Error loading assignment details:', error);
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedAssignment(null);
  };

  // Cancel flow
  const handleStopClick = (assignment) => setCancelTarget(assignment);
  const handleCancelAbort = () => setCancelTarget(null);

  const handleCancelConfirm = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await axios.post(`/ss/executions/${cancelTarget.id}/cancel`);
      setSnack({ open: true, msg: `Script "${cancelTarget.script?.name || cancelTarget.id}" stopped.`, severity: 'success' });
      setCancelTarget(null);
      loadAssignments(); // refresh immediately
    } catch (err) {
      const detail = err.response?.data?.detail || err.message;
      setSnack({ open: true, msg: `Failed to stop: ${detail}`, severity: 'error' });
    } finally {
      setCancelling(false);
    }
  };

  const runningCount = assignments.filter(a => a.status === 'RUNNING').length;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          {/* <Box display="flex" alignItems="center" gap={1}>
            <Typography variant="h4" fontWeight="bold">Script Executions</Typography>
            {runningCount > 0 && (
              <Chip
                icon={<FiberManualRecord sx={{ fontSize: '10px !important', color: '#22c55e !important' }} />}
                label={`${runningCount} running`}
                size="small"
                sx={{ bgcolor: '#dcfce7', color: '#15803d', fontWeight: 700, fontSize: '0.72rem' }}
              />
            )}
          </Box> */}
          <Typography variant="body1" color="text.secondary" fontSize= "0.9rem">
            Monitor and control script assignments
            {runningCount > 0 && ' · Auto-refreshing every 10s'}
          </Typography>
        </Box>
        <Tooltip title="Refresh">
          <IconButton onClick={loadAssignments} color="primary"
            sx={{ bgcolor: '#ede9fe', '&:hover': { bgcolor: '#ddd6fe' } }}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </Box>

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
        <Box display="flex" gap={2} flexDirection={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'stretch', sm: 'center' }}>
          {executionDates.length > 0 && (
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="execution-date-label">Execution Date</InputLabel>
              <Select
                labelId="execution-date-label"
                value={selectedDate}
                label="Execution Date"
                onChange={handleDateChange}
              >
                {executionDates.map((date) => (
                  <MenuItem key={date} value={date}>
                    {formatExecutionDate(date)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
          <TextField
            select label="Status" name="status"
            value={filters.status} onChange={handleFilterChange}
            size="small" sx={{ minWidth: 160 }}
          >
            <MenuItem value="ALL">All</MenuItem>
            <MenuItem value="SCHEDULED">Scheduled</MenuItem>
            <MenuItem value="PENDING">Pending</MenuItem>
            <MenuItem value="RUNNING">Running</MenuItem>
            <MenuItem value="COMPLETED">Completed</MenuItem>
            <MenuItem value="FAILED">Failed</MenuItem>
            <MenuItem value="CANCELLED">Cancelled</MenuItem>
          </TextField>
        </Box>
      </Paper>

      {/* Table */}
      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : filteredAssignments.length > 0 ? (
        <TableContainer component={Paper} sx={{ borderRadius: 2 }}>
          <Table>
            <TableHead sx={{ bgcolor: '#f8fafc' }}>
              <TableRow>
                <TableCell><strong>ID</strong></TableCell>
                <TableCell><strong>Script Name</strong></TableCell>
                <TableCell><strong>Shift</strong></TableCell>
                <TableCell><strong>Status</strong></TableCell>
                <TableCell><strong>Started At</strong></TableCell>
                <TableCell><strong>Completed At</strong></TableCell>
                <TableCell align="right"><strong>Actions</strong></TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredAssignments.map((assignment) => (
                <TableRow
                  key={assignment.id}
                  sx={{
                    bgcolor: assignment.status === 'RUNNING' ? '#f0fdf4' : 'inherit',
                    '&:hover': { bgcolor: assignment.status === 'RUNNING' ? '#dcfce7' : '#f8fafc' },
                    transition: 'background 0.15s',
                  }}
                >
                  <TableCell sx={{ fontWeight: 600, color: '#475569' }}>
                    #{assignment.id}
                  </TableCell>
                  <TableCell>{assignment.script?.name || '-'}</TableCell>
                  <TableCell>{assignment.shift?.shift_name || '-'}</TableCell>
                  <TableCell>
                    <Box display="flex" alignItems="center">
                      {assignment.status === 'RUNNING' && <PulsingDot />}
                      <Chip
                        label={assignment.status}
                        color={statusColors[assignment.status]}
                        size="small"
                        sx={{ fontWeight: 600 }}
                      />
                    </Box>
                  </TableCell>
                  <TableCell>
                    {assignment.started_at
                      ? format(new Date(assignment.started_at), 'MMM dd, yyyy HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell>
                    {assignment.completed_at
                      ? format(new Date(assignment.completed_at), 'MMM dd, yyyy HH:mm')
                      : '-'}
                  </TableCell>
                  <TableCell align="right">
                    <Box display="flex" gap={0.5} justifyContent="flex-end">
                      {/* ── STOP button — only for RUNNING ── */}
                      {assignment.status === 'RUNNING' && (
                        <Tooltip title="Stop this script">
                          <IconButton
                            size="small"
                            onClick={() => handleStopClick(assignment)}
                            sx={{
                              color: '#ef4444',
                              bgcolor: '#fee2e2',
                              '&:hover': { bgcolor: '#fca5a5' },
                              borderRadius: 1.5,
                            }}
                          >
                            <Stop fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      )}
                      <Tooltip title="View details">
                        <IconButton size="small" onClick={() => handleViewDetails(assignment)}>
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
        <Paper sx={{ p: 4, textAlign: 'center', borderRadius: 2 }}>
          <Typography variant="body1" color="text.secondary">
            {assignments.length === 0
              ? 'No script assignments found'
              : `No executions found for ${selectedDate ? formatExecutionDate(selectedDate) : ''} with the selected filters`}
          </Typography>
        </Paper>
      )}

      {/* ── Cancel Confirmation Dialog ────────────────────────────────────── */}
      <Dialog open={!!cancelTarget} onClose={handleCancelAbort} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ color: '#dc2626', fontWeight: 700 }}>
          ⏹ Stop Script?
        </DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 1 }}>
            This will immediately terminate the running script process.
          </Alert>
          <Typography variant="body2">
            Assignment <strong>#{cancelTarget?.id}</strong> —{' '}
            <strong>{cancelTarget?.script?.name}</strong> will be marked as{' '}
            <Chip label="CANCELLED" size="small" /> in the database.
            Any detections saved so far will be kept.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={handleCancelAbort} disabled={cancelling}>Keep Running</Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleCancelConfirm}
            disabled={cancelling}
            startIcon={cancelling ? <CircularProgress size={16} /> : <Stop />}
          >
            {cancelling ? 'Stopping…' : 'Stop Script'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Details Dialog ──────────────────────────────────────────────────── */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>Assignment Details</DialogTitle>
        <DialogContent>
          {selectedAssignment && (
            <Box>
              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">Status</Typography>
                <Chip
                  label={selectedAssignment.status}
                  color={statusColors[selectedAssignment.status]}
                  sx={{ mt: 0.5 }}
                />
              </Box>
              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">Script Name</Typography>
                <Typography variant="body1">{selectedAssignment.script?.name || '-'}</Typography>
              </Box>
              <Box mb={2}>
                <Typography variant="subtitle2" color="text.secondary">Shift</Typography>
                <Typography variant="body1">
                  {selectedAssignment.shift?.shift_name || '-'}
                  {selectedAssignment.shift?.exam?.exam_name && (
                    <Typography variant="caption" display="block" color="text.secondary">
                      Exam: {selectedAssignment.shift.exam.exam_name}
                    </Typography>
                  )}
                </Typography>
              </Box>
              {selectedAssignment.started_at && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">Started At</Typography>
                  <Typography variant="body1">
                    {format(new Date(selectedAssignment.started_at), 'MMM dd, yyyy HH:mm:ss')}
                  </Typography>
                </Box>
              )}
              {selectedAssignment.completed_at && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">Completed At</Typography>
                  <Typography variant="body1">
                    {format(new Date(selectedAssignment.completed_at), 'MMM dd, yyyy HH:mm:ss')}
                  </Typography>
                </Box>
              )}
              {selectedAssignment.started_at && selectedAssignment.completed_at && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">Duration</Typography>
                  <Typography variant="body1">
                    {Math.round(
                      (new Date(selectedAssignment.completed_at) - new Date(selectedAssignment.started_at)) / 1000
                    )}{' '}seconds
                  </Typography>
                </Box>
              )}
              {selectedAssignment.result_data && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">Result Data</Typography>
                  <Paper sx={{ p: 2, bgcolor: '#f5f5f5', mt: 1 }}>
                    <pre style={{ margin: 0, fontSize: '12px', overflow: 'auto' }}>
                      {JSON.stringify(selectedAssignment.result_data, null, 2)}
                    </pre>
                  </Paper>
                </Box>
              )}
              {selectedAssignment.error_log && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="error">Error Log</Typography>
                  <Paper sx={{ p: 2, bgcolor: '#ffebee', mt: 1 }}>
                    <Typography variant="body2" color="error">
                      {selectedAssignment.error_log}
                    </Typography>
                  </Paper>
                </Box>
              )}
              {selectedAssignment.assignment_info && (
                <>
                  <Box mb={2}>
                    <Typography variant="subtitle2" color="text.secondary">Frequency</Typography>
                    <Typography variant="body1">
                      Every {selectedAssignment.assignment_info.custom_frequency_minutes ||
                        selectedAssignment.script?.default_frequency_minutes ||
                        '?'} minutes
                    </Typography>
                  </Box>
                  {(selectedAssignment.assignment_info.custom_start_time ||
                    selectedAssignment.assignment_info.custom_end_time) && (
                    <Box mb={2}>
                      <Typography variant="subtitle2" color="text.secondary">Custom Time Window</Typography>
                      <Typography variant="body1">
                        {selectedAssignment.assignment_info.custom_start_time || 'N/A'} -{' '}
                        {selectedAssignment.assignment_info.custom_end_time || 'N/A'}
                      </Typography>
                    </Box>
                  )}
                  {selectedAssignment.assignment_info.notes && (
                    <Box mb={2}>
                      <Typography variant="subtitle2" color="text.secondary">Assignment Notes</Typography>
                      <Typography variant="body1">{selectedAssignment.assignment_info.notes}</Typography>
                    </Box>
                  )}
                </>
              )}
              {selectedAssignment.notes && (
                <Box mb={2}>
                  <Typography variant="subtitle2" color="text.secondary">Execution Notes</Typography>
                  <Typography variant="body1">{selectedAssignment.notes}</Typography>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          {selectedAssignment?.status === 'RUNNING' && (
            <Button
              variant="outlined" color="error"
              startIcon={<Stop />}
              onClick={() => { handleCloseDialog(); handleStopClick(selectedAssignment); }}
            >
              Stop Script
            </Button>
          )}
          <Button onClick={handleCloseDialog}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* ── Snackbar ───────────────────────────────────────────────────────── */}
      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack(s => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
      >
        <Alert severity={snack.severity} onClose={() => setSnack(s => ({ ...s, open: false }))}>
          {snack.msg}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Executions;
